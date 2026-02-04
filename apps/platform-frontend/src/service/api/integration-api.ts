import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  AuthCredentialType,
  ConfigureIntegrationRequest,
  CreateIntegrationRequest,
  Integration,
  IntegrationConfig,
  IntegrationFieldType,
  IntegrationSummary,
  ProjectIntegrationLink,
  TestIntegrationResponse,
  TicketSystem,
  UpdateIntegrationRequest,
} from '@viberglass/types'

const DEFAULT_PROJECT_ID = 'global'

// ============================================================================
// Top-level Integration Management
// ============================================================================

/**
 * Get all integrations (optionally filtered by system)
 */
export async function getIntegrations(system?: TicketSystem): Promise<Integration[]> {
  const url = new URL(`${API_BASE_URL}/api/integrations`)
  if (system) {
    url.searchParams.append('system', system)
  }

  const response = await apiFetch(url.toString())
  if (!response.ok) {
    throw new Error('Failed to fetch integrations')
  }
  const data: ApiResponse<Integration[]> = await response.json()
  return data.data
}

/**
 * Create a new integration
 */
export async function createIntegration(
  request: CreateIntegrationRequest
): Promise<Integration> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create integration')
  }

  const data: ApiResponse<Integration> = await response.json()
  return data.data
}

/**
 * Get a specific integration by ID
 */
export async function getIntegration(integrationId: string): Promise<Integration> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}`)

  if (!response.ok) {
    throw new Error('Failed to fetch integration')
  }

  const data: ApiResponse<Integration> = await response.json()
  return data.data
}

/**
 * Update an integration
 */
export async function updateIntegration(
  integrationId: string,
  request: UpdateIntegrationRequest
): Promise<Integration> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update integration')
  }

  const data: ApiResponse<Integration> = await response.json()
  return data.data
}

/**
 * Delete an integration
 */
export async function deleteIntegration(integrationId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete integration')
  }
}

/**
 * Test an integration connection
 */
export async function testIntegration(integrationId: string): Promise<TestIntegrationResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/test`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error('Failed to test integration')
  }

  const data: ApiResponse<TestIntegrationResponse> = await response.json()
  return data.data
}

// ============================================================================
// Project-Integration Link Management
// ============================================================================

export interface ProjectIntegrationWithDetails extends ProjectIntegrationLink {
  integration: {
    id: string
    name: string
    system: TicketSystem
    isActive: boolean
  }
}

/**
 * Get all integrations linked to a project
 */
export async function getProjectIntegrations(
  projectId: string
): Promise<ProjectIntegrationWithDetails[]> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/project/${projectId}`
  )

  if (!response.ok) {
    throw new Error('Failed to fetch project integrations')
  }

  const data: ApiResponse<ProjectIntegrationWithDetails[]> = await response.json()
  return data.data
}

/**
 * Link an integration to a project
 */
export async function linkIntegrationToProject(
  projectId: string,
  integrationId: string,
  isPrimary?: boolean
): Promise<ProjectIntegrationLink> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/project/${projectId}/link`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ integrationId, isPrimary }),
    }
  )

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to link integration')
  }

  const data: ApiResponse<ProjectIntegrationLink> = await response.json()
  return data.data
}

/**
 * Unlink an integration from a project
 */
export async function unlinkIntegrationFromProject(
  projectId: string,
  integrationId: string
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/project/${projectId}/link/${integrationId}`,
    {
      method: 'DELETE',
    }
  )

  if (!response.ok) {
    throw new Error('Failed to unlink integration')
  }
}

/**
 * Set an integration as primary for a project
 */
export async function setPrimaryIntegration(
  projectId: string,
  integrationId: string
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/project/${projectId}/primary/${integrationId}`,
    {
      method: 'PUT',
    }
  )

  if (!response.ok) {
    throw new Error('Failed to set primary integration')
  }
}

// ============================================================================
// Available Integration Types
// ============================================================================

export interface AvailableIntegrationType {
  id: TicketSystem
  label: string
  category: 'scm' | 'ticketing' | 'inbound'
  description: string
  authTypes: AuthCredentialType[]
  configFields: Array<{
    key: string
    label: string
    type: IntegrationFieldType
    required?: boolean
    description?: string
    options?: Array<{ label: string; value: string }>
    placeholder?: string
  }>
  supports: {
    issues: boolean
    webhooks?: boolean
    pullRequests?: boolean
  }
  status: 'ready' | 'stub'
}

/**
 * Get all available integration types
 */
export async function getAvailableIntegrationTypes(): Promise<AvailableIntegrationType[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/types/available`)

  if (!response.ok) {
    throw new Error('Failed to fetch available integration types')
  }

  const data: ApiResponse<AvailableIntegrationType[]> = await response.json()
  return data.data
}

// ============================================================================
// Legacy Project-Scoped Integration APIs (Deprecated)
// These endpoints are kept for backward compatibility but will be removed.
// Use the top-level integration APIs above instead.
// ============================================================================

/**
 * @deprecated Use getIntegrations() and getProjectIntegrations() instead
 */
export async function getProjectIntegrationsLegacy(
  projectId?: string
): Promise<IntegrationSummary[]> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await apiFetch(
    `${API_BASE_URL}/api/projects/${targetProjectId}/integrations`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch integrations')
  }
  const data: ApiResponse<IntegrationSummary[]> = await response.json()
  return data.data
}

/**
 * Get integration summaries for a project (uses the new API internally)
 * This is a transitional function that maps the new data structure to the old one
 */
export async function getProjectIntegrationSummaries(
  projectId: string
): Promise<IntegrationSummary[]> {
  const [availableTypes, projectIntegrations] = await Promise.all([
    getAvailableIntegrationTypes(),
    getProjectIntegrations(projectId),
  ])

  // Create a map of configured integrations
  const configuredMap = new Map(
    projectIntegrations.map((link) => [link.integration.system, link])
  )

  // Map available types to summaries
  return availableTypes.map((type) => {
    const configured = configuredMap.get(type.id)
    return {
      id: type.id,
      label: type.label,
      category: type.category,
      description: type.description,
      authTypes: type.authTypes,
      configFields: type.configFields,
      supports: type.supports,
      status: type.status,
      configStatus: type.status === 'stub' ? 'stub' : configured ? 'configured' : 'not_configured',
      configuredAt: configured ? configured.createdAt : undefined,
    }
  })
}

/**
 * Get all available integration types as summaries (for global settings page)
 * Maps available types to IntegrationSummary format without project-specific config status
 */
export async function getAllIntegrationSummaries(): Promise<IntegrationSummary[]> {
  const [availableTypes, allIntegrations] = await Promise.all([
    getAvailableIntegrationTypes(),
    getIntegrations(),
  ])

  // Create a map of configured integrations by system type
  const configuredMap = new Map(
    allIntegrations.map((integration) => [integration.system, integration])
  )

  // Map available types to summaries
  return availableTypes.map((type) => {
    const configured = configuredMap.get(type.id)
    return {
      id: type.id,
      label: type.label,
      category: type.category,
      description: type.description,
      authTypes: type.authTypes,
      configFields: type.configFields,
      supports: type.supports,
      status: type.status,
      configStatus: type.status === 'stub' ? 'stub' : configured ? 'configured' : 'not_configured',
      configuredAt: configured ? configured.createdAt : undefined,
    }
  })
}

/**
 * @deprecated Use getIntegration() instead
 */
export async function getIntegrationConfig(
  projectId: string | undefined,
  integrationId: TicketSystem
): Promise<IntegrationConfig | null> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await apiFetch(
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
 * @deprecated Use createIntegration() and linkIntegrationToProject() instead
 */
export async function configureIntegration(
  projectId: string | undefined,
  integrationId: TicketSystem,
  config: ConfigureIntegrationRequest
): Promise<IntegrationConfig> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await apiFetch(
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
 * @deprecated Use deleteIntegration() or unlinkIntegrationFromProject() instead
 */
export async function removeIntegration(
  projectId: string | undefined,
  integrationId: TicketSystem
): Promise<void> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await apiFetch(
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
 * @deprecated Use testIntegration() instead
 */
export async function testIntegrationConnection(
  projectId: string | undefined,
  integrationId: TicketSystem,
  config: ConfigureIntegrationRequest
): Promise<TestIntegrationResponse> {
  const targetProjectId = projectId ?? DEFAULT_PROJECT_ID
  const response = await apiFetch(
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

// ============================================================================
// Webhook configuration under integrations (legacy - will be moved)
// ============================================================================

export interface IntegrationWebhookConfig {
  id: string
  provider: string
  webhookUrl: string
  allowedEvents: string[]
  autoExecute: boolean
  active: boolean
  hasSecret: boolean
  webhookSecret?: string
  createdAt: string
  updatedAt: string
}

export interface IntegrationWebhookDelivery {
  id: string
  deliveryId: string
  eventType: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  errorMessage: string | null
  ticketId: string | null
  createdAt: string
  processedAt: string | null
}

/**
 * Get webhook config for an integration
 */
export async function getIntegrationWebhook(
  _projectId: string | undefined,
  integrationId: TicketSystem
): Promise<IntegrationWebhookConfig | null> {
  // First get the integration by system type to get its ID
  const integrations = await getIntegrations(integrationId)
  if (integrations.length === 0) {
    return null
  }
  
  const integration = integrations[0]
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integration.id}/webhook`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch webhook config')
  }
  const data: ApiResponse<IntegrationWebhookConfig | null> = await response.json()
  return data.data
}

/**
 * Create or update webhook config for an integration
 */
export async function saveIntegrationWebhook(
  _projectId: string | undefined,
  integrationId: TicketSystem,
  config: {
    allowedEvents?: string[]
    autoExecute?: boolean
    webhookSecret?: string
    generateSecret?: boolean
  }
): Promise<IntegrationWebhookConfig> {
  // First get the integration by system type to get its ID
  const integrations = await getIntegrations(integrationId)
  if (integrations.length === 0) {
    throw new Error('Integration not found')
  }
  
  const integration = integrations[0]
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integration.id}/webhook`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to save webhook config')
  }
  const data: ApiResponse<IntegrationWebhookConfig> = await response.json()
  return data.data
}

/**
 * Delete webhook config for an integration
 */
export async function deleteIntegrationWebhook(
  _projectId: string | undefined,
  integrationId: TicketSystem
): Promise<void> {
  // First get the integration by system type to get its ID
  const integrations = await getIntegrations(integrationId)
  if (integrations.length === 0) {
    throw new Error('Integration not found')
  }
  
  const integration = integrations[0]
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integration.id}/webhook`,
    { method: 'DELETE' }
  )
  if (!response.ok) {
    throw new Error('Failed to delete webhook config')
  }
}

/**
 * Get delivery history for an integration's webhook
 */
export async function getIntegrationDeliveries(
  _projectId: string | undefined,
  integrationId: TicketSystem,
  limit: number = 50
): Promise<IntegrationWebhookDelivery[]> {
  // First get the integration by system type to get its ID
  const integrations = await getIntegrations(integrationId)
  if (integrations.length === 0) {
    return []
  }
  
  const integration = integrations[0]
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integration.id}/deliveries?limit=${limit}`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch deliveries')
  }
  const data: ApiResponse<IntegrationWebhookDelivery[]> = await response.json()
  return data.data
}

/**
 * Retry a failed delivery
 */
export async function retryIntegrationDelivery(
  _projectId: string | undefined,
  integrationId: TicketSystem,
  deliveryId: string
): Promise<void> {
  // First get the integration by system type to get its ID
  const integrations = await getIntegrations(integrationId)
  if (integrations.length === 0) {
    throw new Error('Integration not found')
  }
  
  const integration = integrations[0]
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integration.id}/deliveries/${deliveryId}/retry`,
    { method: 'POST' }
  )
  if (!response.ok) {
    throw new Error('Failed to retry delivery')
  }
}

// Re-export types for convenience
export type {
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
} from '@viberglass/types'
