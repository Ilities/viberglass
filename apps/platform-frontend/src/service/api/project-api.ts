import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  CreateProjectRequest,
  PaginatedResponse,
  Project,
  ProjectScmConfig,
  ProjectReadiness,
  UpsertProjectScmConfigRequest,
  UpdateProjectRequest,
} from '@viberglass/types'

export async function getProjects(limit: number = 50, offset: number = 0): Promise<Project[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch spaces')
  }
  const data: PaginatedResponse<Project> = await response.json()
  return data.data
}

export async function getProjectBySlug(slug: string): Promise<Project> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/by-name/${slug}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Space not found')
    }
    throw new Error('Failed to fetch space')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function getProject(id: string): Promise<Project> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Space not found')
    }
    throw new Error('Failed to fetch space')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function createProject(project: CreateProjectRequest): Promise<Project> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(project),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create space')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function updateProject(id: string, updates: UpdateProjectRequest): Promise<Project> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update space')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function deleteProject(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete space')
  }
}

export async function archiveProject(id: string): Promise<Project> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${id}/archive`, { method: 'POST' })
  if (!response.ok) throw new Error('Failed to archive space')
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function getProjectReadiness(id: string): Promise<ProjectReadiness> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${id}/readiness`)
  if (!response.ok) throw new Error('Failed to check space readiness')
  const data: ApiResponse<ProjectReadiness> = await response.json()
  return data.data
}

export interface ProjectDeletionSummary {
  tickets: number
  runs: number
  sessions: number
  schedules: number
}

export async function getProjectDeletionSummary(id: string): Promise<ProjectDeletionSummary> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${id}/deletion-summary`)
  if (!response.ok) throw new Error('Failed to load affected record counts')
  const data: ApiResponse<ProjectDeletionSummary> = await response.json()
  return data.data
}

export async function getProjectScmConfig(projectId: string): Promise<ProjectScmConfig | null> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/scm-config`)
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error('Failed to fetch space SCM configuration')
  }
  const data: ApiResponse<ProjectScmConfig> = await response.json()
  return data.data
}

export async function upsertProjectScmConfig(
  projectId: string,
  request: UpsertProjectScmConfigRequest
): Promise<ProjectScmConfig> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/scm-config`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to save space SCM configuration')
  }

  const data: ApiResponse<ProjectScmConfig> = await response.json()
  return data.data
}

export async function deleteProjectScmConfig(projectId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/scm-config`, {
    method: 'DELETE',
  })

  if (response.status === 404) {
    return
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to delete space SCM configuration')
  }
}

// Re-export types for convenience
export type {
  CreateProjectRequest,
  Project,
  ProjectScmConfig,
  UpsertProjectScmConfigRequest,
  UpdateProjectRequest,
} from '@viberglass/types'
