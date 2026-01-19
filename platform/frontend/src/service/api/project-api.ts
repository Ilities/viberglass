import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  CreateProjectRequest,
  PaginatedResponse,
  Project,
  UpdateProjectRequest,
} from '@viberator/types'

export async function getProjects(limit: number = 50, offset: number = 0): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch projects')
  }
  const data: PaginatedResponse<Project> = await response.json()
  return data.data
}

export async function getProjectBySlug(slug: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/by-name/${slug}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Project not found')
    }
    throw new Error('Failed to fetch project')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Project not found')
    }
    throw new Error('Failed to fetch project')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function createProject(project: CreateProjectRequest): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(project),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create project')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function updateProject(id: string, updates: UpdateProjectRequest): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update project')
  }
  const data: ApiResponse<Project> = await response.json()
  return data.data
}

export async function deleteProject(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete project')
  }
}

// Re-export types for convenience
export type { Project, CreateProjectRequest, UpdateProjectRequest } from '@viberator/types'
