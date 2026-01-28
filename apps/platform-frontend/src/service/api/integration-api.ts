import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
  TicketSystem,
} from '@viberglass/types'

const DEFAULT_PROJECT_ID = 'global'

/**
 * Get all integrations with their configuration status for a project
 */
export async function getProjectIntegrations(
  projectId?: string
): Promise<IntegrationSummary[]> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await fetch(`${API_BASE_URL}/api/projects/${targetProjectId}/integrations`)
  if (!response.ok) {
    throw new Error('Failed to fetch integrations')
  }
  const data: ApiResponse<IntegrationSummary[]> = await response.json()
  return data.data
}

/**
 * Get a specific integration's configuration for a project
 */
export async function getIntegrationConfig(
  projectId: string | undefined,
  integrationId: TicketSystem
): Promise<IntegrationConfig | null> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${targetProjectId}/integrations/${integrationId}`
  )
  if (response.status === 404) {
    return null
  }
  if (!response.ok) {
    throw new Error('Failed to fetch integration config')
  }
  const data: ApiResponse<IntegrationConfig> = await response.json()
  return data.data
}

/**
 * Configure an integration for a project
 */
export async function configureIntegration(
  projectId: string | undefined,
  integrationId: TicketSystem,
  config: ConfigureIntegrationRequest
): Promise<IntegrationConfig> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${targetProjectId}/integrations/${integrationId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to configure integration')
  }
  const data: ApiResponse<IntegrationConfig> = await response.json()
  return data.data
}

/**
 * Remove an integration configuration from a project
 */
export async function removeIntegration(
  projectId: string | undefined,
  integrationId: TicketSystem
): Promise<void> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${targetProjectId}/integrations/${integrationId}`,
    {
      method: 'DELETE',
    }
  )
  if (!response.ok) {
    throw new Error('Failed to remove integration')
  }
}

/**
 * Test an integration connection without saving
 */
export async function testIntegrationConnection(
  projectId: string | undefined,
  integrationId: TicketSystem,
  config: ConfigureIntegrationRequest
): Promise<TestIntegrationResponse> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${targetProjectId}/integrations/${integrationId}/test`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(config),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to test integration')
  }
  const data: ApiResponse<TestIntegrationResponse> = await response.json()
  return data.data
}

// Re-export types for convenience
export type {
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
} from '@viberglass/types'
