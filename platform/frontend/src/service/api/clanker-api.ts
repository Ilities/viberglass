import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  Clanker,
  ClankerConfigFile,
  ClankerHealthStatus,
  CreateClankerRequest,
  DeploymentStrategy,
  PaginatedResponse,
  UpdateClankerRequest,
} from '@viberator/types'

// Clanker API functions

export async function getClankers(limit: number = 50, offset: number = 0): Promise<Clanker[]> {
  const response = await fetch(`${API_BASE_URL}/api/clankers?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch clankers')
  }
  const data: PaginatedResponse<Clanker> = await response.json()
  return data.data
}

export async function getClankerBySlug(slug: string): Promise<Clanker> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/by-slug/${slug}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Clanker not found')
    }
    throw new Error('Failed to fetch clanker')
  }
  const data: ApiResponse<Clanker> = await response.json()
  return data.data
}

export async function getClanker(id: string): Promise<Clanker> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Clanker not found')
    }
    throw new Error('Failed to fetch clanker')
  }
  const data: ApiResponse<Clanker> = await response.json()
  return data.data
}

export async function createClanker(clanker: CreateClankerRequest): Promise<Clanker> {
  const response = await fetch(`${API_BASE_URL}/api/clankers`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(clanker),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create clanker')
  }
  const data: ApiResponse<Clanker> = await response.json()
  return data.data
}

export async function updateClanker(id: string, updates: UpdateClankerRequest): Promise<Clanker> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update clanker')
  }
  const data: ApiResponse<Clanker> = await response.json()
  return data.data
}

export async function deleteClanker(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete clanker')
  }
}

export async function startClanker(id: string): Promise<Clanker> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${id}/start`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to start clanker')
  }
  const data: ApiResponse<Clanker> = await response.json()
  return data.data
}

export async function stopClanker(id: string): Promise<Clanker> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${id}/stop`, {
    method: 'POST',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to stop clanker')
  }
  const data: ApiResponse<Clanker> = await response.json()
  return data.data
}

export async function getClankerHealth(id: string): Promise<ClankerHealthStatus> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${id}/health`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Clanker not found')
    }
    throw new Error('Failed to fetch clanker health')
  }
  const data: ApiResponse<ClankerHealthStatus> = await response.json()
  return data.data
}

// Config file API functions

export async function getConfigFiles(clankerId: string): Promise<ClankerConfigFile[]> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${clankerId}/config-files`)
  if (!response.ok) {
    throw new Error('Failed to fetch config files')
  }
  const data: ApiResponse<ClankerConfigFile[]> = await response.json()
  return data.data
}

export async function getConfigFile(clankerId: string, fileType: string): Promise<ClankerConfigFile> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${clankerId}/config-files/${encodeURIComponent(fileType)}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Config file not found')
    }
    throw new Error('Failed to fetch config file')
  }
  const data: ApiResponse<ClankerConfigFile> = await response.json()
  return data.data
}

export async function deleteConfigFile(clankerId: string, fileType: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/clankers/${clankerId}/config-files/${encodeURIComponent(fileType)}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    throw new Error('Failed to delete config file')
  }
}

// Deployment Strategy API functions

export async function getDeploymentStrategies(): Promise<DeploymentStrategy[]> {
  const response = await fetch(`${API_BASE_URL}/api/deployment-strategies`)
  if (!response.ok) {
    throw new Error('Failed to fetch deployment strategies')
  }
  const data: ApiResponse<DeploymentStrategy[]> = await response.json()
  return data.data
}

export async function getDeploymentStrategy(id: string): Promise<DeploymentStrategy> {
  const response = await fetch(`${API_BASE_URL}/api/deployment-strategies/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Deployment strategy not found')
    }
    throw new Error('Failed to fetch deployment strategy')
  }
  const data: ApiResponse<DeploymentStrategy> = await response.json()
  return data.data
}

export async function getDeploymentStrategyByName(name: string): Promise<DeploymentStrategy> {
  const response = await fetch(`${API_BASE_URL}/api/deployment-strategies/by-name/${encodeURIComponent(name)}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Deployment strategy not found')
    }
    throw new Error('Failed to fetch deployment strategy')
  }
  const data: ApiResponse<DeploymentStrategy> = await response.json()
  return data.data
}

// Re-export types for convenience
export type {
  Clanker,
  ClankerConfigFile,
  ClankerHealthStatus,
  CreateClankerRequest,
  UpdateClankerRequest,
  DeploymentStrategy,
  ConfigFileInput,
} from '@viberator/types'
