import { API_BASE_URL } from '@/lib'

export interface AuthCredentials {
  type: 'api_key' | 'oauth' | 'basic' | 'token'
  apiKey?: string
  username?: string
  password?: string
  token?: string
  clientId?: string
  clientSecret?: string
  refreshToken?: string
  baseUrl?: string
}

export interface Project {
  id: string
  name: string
  slug: string
  ticketSystem: 'jira' | 'linear' | 'github' | 'gitlab' | 'azure' | 'asana' | 'trello' | 'monday' | 'clickup'
  credentials: AuthCredentials
  webhookUrl?: string
  autoFixEnabled: boolean
  autoFixTags: string[]
  customFieldMappings: Record<string, string>
  repositoryUrl?: string
  createdAt: string
  updatedAt: string
}

export interface ProjectsResponse {
  success: boolean
  data: Project[]
  pagination: {
    limit: number
    offset: number
    count: number
  }
}

export interface ProjectResponse {
  success: boolean
  data: Project
}

export async function getProjects(limit: number = 50, offset: number = 0): Promise<Project[]> {
  const response = await fetch(`${API_BASE_URL}/api/projects?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch projects')
  }
  const data: ProjectsResponse = await response.json()
  return data.data
}

export async function getProjectByName(name: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/by-name/${name}`)
  if (!response.ok) {
    throw new Error('Failed to fetch project')
  }
  const data: ProjectResponse = await response.json()
  return data.data
}

export async function getProject(id: string): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}`)
  if (!response.ok) {
    throw new Error('Failed to fetch project')
  }
  const data: ProjectResponse = await response.json()
  return data.data
}

export async function createProject(project: {
  name: string
  ticketSystem: string
  credentials: Record<string, string>
  repositoryUrl: string
  autoFixEnabled: boolean
  autoFixTags: string[]
  customFieldMappings: {}
}): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(project),
  })
  if (!response.ok) {
    throw new Error('Failed to create project')
  }
  const data: ProjectResponse = await response.json()
  return data.data
}

export async function updateProject(id: string, updates: Partial<Project>): Promise<Project> {
  const response = await fetch(`${API_BASE_URL}/api/projects/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    throw new Error('Failed to update project')
  }
  const data: ProjectResponse = await response.json()
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
