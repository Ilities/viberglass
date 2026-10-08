import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  AuthCredentialType,
  CreateIntegrationCredentialRequest,
  CreateIntegrationRequest,
  Integration,
  IntegrationCategory,
  IntegrationCredential,
  IntegrationFieldType,
  IntegrationSummary,
  ProjectIntegrationLink,
  TestIntegrationResponse,
  TicketSystem,
  UpdateIntegrationCredentialRequest,
  UpdateIntegrationRequest,
} from '@viberglass/types'

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
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to delete integration')
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
    `${API_BASE_URL}/api/integrations/space/${projectId}`
  )

  if (!response.ok) {
    throw new Error('Failed to fetch space integrations')
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
    `${API_BASE_URL}/api/integrations/space/${projectId}/link`,
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
    `${API_BASE_URL}/api/integrations/space/${projectId}/link/${integrationId}`,
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
    `${API_BASE_URL}/api/integrations/space/${projectId}/primary/${integrationId}`,
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
  category: IntegrationCategory
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

export interface IntegrationInstance {
  id: string
  name: string
  createdAt: string
}

export interface IntegrationSettingsListItem extends Omit<IntegrationSummary, 'id'> {
  id: string
  system: TicketSystem
  /**
   * @deprecated Use instances array instead
   */
  integrationEntityId?: string
  /**
   * @deprecated Use instances array instead
   */
  integrationName?: string
  /** Configured instances of this integration type */
  instances: IntegrationInstance[]
}

/**
 * Get integration cards for global settings grouped by integration type.
 * Each card represents one integration type (e.g., GitHub) with all configured instances as subitems.
 */
export async function getIntegrationSettingsListItems(): Promise<IntegrationSettingsListItem[]> {
  const [availableTypes, allIntegrations] = await Promise.all([
    getAvailableIntegrationTypes(),
    getIntegrations(),
  ])

  // Group integrations by system type
  const integrationsBySystem = new Map<TicketSystem, Integration[]>()
  for (const integration of allIntegrations) {
    const existing = integrationsBySystem.get(integration.system)
    if (existing) {
      existing.push(integration)
    } else {
      integrationsBySystem.set(integration.system, [integration])
    }
  }

  // Map each available type to a list item with its instances
  return availableTypes.map((type) => {
    const configured = integrationsBySystem.get(type.id) ?? []
    const instances: IntegrationInstance[] = configured.map((integration) => ({
      id: integration.id,
      name: integration.name,
      createdAt: integration.createdAt,
    }))

    // Sort instances by creation date (newest first)
    instances.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    const isConfigured = instances.length > 0
    const firstInstance = instances[0]

    return {
      id: isConfigured ? firstInstance.id : `new:${type.id}`,
      system: type.id,
      // Keep legacy fields for backward compatibility during transition
      integrationEntityId: firstInstance?.id,
      integrationName: instances.length === 1 ? firstInstance?.name : undefined,
      label: type.label,
      category: type.category,
      description: type.description,
      authTypes: type.authTypes,
      configFields: type.configFields,
      supports: type.supports,
      status: type.status,
      configStatus: type.status === 'stub' ? 'stub' : isConfigured ? 'configured' : 'not_configured',
      configuredAt: firstInstance?.createdAt,
      instances,
    }
  })
}

// ============================================================================
// Webhook configuration under integrations
// ============================================================================

export interface IntegrationInboundWebhookConfig {
  id: string
  integrationId: string
  provider: string
  webhookUrl: string
  webhookSecret: string | null
  hasSecret: boolean
  /** Custom webhooks only: the space their tasks go to. */
  projectId: string | null
  active: boolean
  planNewIssues: boolean
  /** The tracker account whose mention in a comment asks the agent. */
  botUsername: string | null
  inboundEvents: string[]
  events: string[]
  createdAt: string
  updatedAt: string
}

function toAbsoluteWebhookUrl(webhookUrl: string): string {
  try {
    return new URL(webhookUrl, API_BASE_URL).toString()
  } catch {
    return webhookUrl
  }
}

function normalizeInboundWebhookConfig(
  config: IntegrationInboundWebhookConfig
): IntegrationInboundWebhookConfig {
  return {
    ...config,
    botUsername: config.botUsername ?? null,
    webhookUrl: toAbsoluteWebhookUrl(config.webhookUrl),
  }
}

export interface IntegrationWebhookDelivery {
  id: string
  provider: string
  webhookConfigId: string | null
  deliveryId: string
  eventType: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed' | 'ignored'
  retryable: boolean
  errorMessage: string | null
  ticketId: string | null
  projectId: string | null
  createdAt: string
  processedAt: string | null
}

export interface IntegrationWebhookRetryResult {
  delivery: IntegrationWebhookDelivery
  retry: {
    status: 'processed' | 'ignored' | 'failed' | 'duplicate'
    reason?: string
    ticketId?: string
    jobId?: string
  }
}

/**
 * List inbound webhook configs for an integration
 */
export async function getIntegrationInboundWebhooks(
  integrationEntityId: string
): Promise<IntegrationInboundWebhookConfig[]> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/inbound`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch inbound webhooks')
  }
  const data: ApiResponse<IntegrationInboundWebhookConfig[]> = await response.json()
  return data.data.map(normalizeInboundWebhookConfig)
}

/**
 * Create inbound webhook config for an integration
 */
export async function createIntegrationInboundWebhook(
  integrationEntityId: string,
  config: {
    events?: string[]
    planNewIssues?: boolean
    botUsername?: string | null
    webhookSecret?: string
    generateSecret?: boolean
    projectId?: string | null
    active?: boolean
  }
): Promise<IntegrationInboundWebhookConfig> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/inbound`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowedEvents: config.events,
        planNewIssues: config.planNewIssues,
        botUsername: config.botUsername,
        webhookSecret: config.webhookSecret,
        generateSecret: config.generateSecret,
        projectId: config.projectId,
        active: config.active,
      }),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to create inbound webhook')
  }
  const data: ApiResponse<IntegrationInboundWebhookConfig> = await response.json()
  return normalizeInboundWebhookConfig(data.data)
}

/**
 * Update inbound webhook config
 */
export async function updateIntegrationInboundWebhook(
  integrationEntityId: string,
  configId: string,
  config: {
    events?: string[]
    planNewIssues?: boolean
    botUsername?: string | null
    webhookSecret?: string
    generateSecret?: boolean
    projectId?: string | null
    active?: boolean
  }
): Promise<IntegrationInboundWebhookConfig> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/inbound/${configId}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allowedEvents: config.events,
        planNewIssues: config.planNewIssues,
        botUsername: config.botUsername,
        webhookSecret: config.webhookSecret,
        generateSecret: config.generateSecret,
        projectId: config.projectId,
        active: config.active,
      }),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update inbound webhook')
  }
  const data: ApiResponse<IntegrationInboundWebhookConfig> = await response.json()
  return normalizeInboundWebhookConfig(data.data)
}

/**
 * Delete inbound webhook config for an integration
 */
export async function deleteIntegrationInboundWebhook(
  integrationEntityId: string,
  configId: string
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/inbound/${configId}`,
    { method: 'DELETE' }
  )
  if (!response.ok) {
    throw new Error('Failed to delete inbound webhook')
  }
}

/**
 * Get inbound delivery history for an integration
 */
export async function getIntegrationDeliveries(
  integrationEntityId: string,
  inboundConfigId: string,
  options: {
    limit?: number
    statuses?: Array<IntegrationWebhookDelivery['status']>
  } = {}
): Promise<IntegrationWebhookDelivery[]> {
  const limit = options.limit ?? 50
  const query = new URLSearchParams({ limit: String(limit) })
  if (options.statuses && options.statuses.length > 0) {
    query.set('statuses', options.statuses.join(','))
  }

  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/inbound/${inboundConfigId}/deliveries?${query.toString()}`
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to fetch deliveries')
  }
  const data: ApiResponse<IntegrationWebhookDelivery[]> = await response.json()
  return data.data
}

/**
 * Retry a failed delivery
 */
export async function retryIntegrationDelivery(
  integrationEntityId: string,
  inboundConfigId: string,
  deliveryId: string
): Promise<IntegrationWebhookRetryResult> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/inbound/${inboundConfigId}/deliveries/${deliveryId}/retry`,
    { method: 'POST' }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.reason || error.message || error.error || 'Failed to retry delivery')
  }
  const data: ApiResponse<IntegrationWebhookRetryResult> = await response.json()
  return data.data
}

// ============================================================================
// Which tracker issues spaces take
// ============================================================================

/** A space taking a connection's issues: those with the label, or for GitHub with no label, every issue in its repository. */
export interface TrackerIssueRule {
  id: string
  projectId: string
  integrationId: string
  label: string | null
  planNewIssues: boolean
}

export interface ConnectionSpaceRule extends TrackerIssueRule {
  projectName: string
  projectSlug: string
}

export async function getSpaceIssueRules(projectId: string): Promise<TrackerIssueRule[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/space/${projectId}/issue-rules`)
  if (!response.ok) throw new Error('Failed to load which tracker issues the space takes')
  const data: ApiResponse<TrackerIssueRule[]> = await response.json()
  return data.data
}

export async function saveSpaceIssueRules(
  projectId: string,
  integrationId: string,
  rules: Array<Pick<TrackerIssueRule, 'label' | 'planNewIssues'>>
): Promise<TrackerIssueRule[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/space/${projectId}/issue-rules/${integrationId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rules }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to save which tracker issues the space takes')
  }
  const data: ApiResponse<TrackerIssueRule[]> = await response.json()
  return data.data
}

/** The rules of every space that takes the connection's issues. */
export async function getConnectionIssueRules(integrationId: string): Promise<ConnectionSpaceRule[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/issue-rules`)
  if (!response.ok) throw new Error("Failed to load the spaces that take the connection's issues")
  const data: ApiResponse<ConnectionSpaceRule[]> = await response.json()
  return data.data
}

// ============================================================================
// Integration Credentials (SCM Credentials)
// ============================================================================

/**
 * List all credentials for an integration
 */
export async function getIntegrationCredentials(integrationId: string): Promise<IntegrationCredential[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/credentials`)
  if (!response.ok) {
    throw new Error('Failed to fetch integration credentials')
  }
  const data: ApiResponse<IntegrationCredential[]> = await response.json()
  return data.data
}

/**
 * Create a new credential for an integration
 */
export async function createIntegrationCredential(
  integrationId: string,
  request: CreateIntegrationCredentialRequest
): Promise<IntegrationCredential> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/credentials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to create credential')
  }
  const data: ApiResponse<IntegrationCredential> = await response.json()
  return data.data
}

/**
 * Get a specific credential
 */
export async function getIntegrationCredential(
  integrationId: string,
  credentialId: string
): Promise<IntegrationCredential> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/credentials/${credentialId}`)
  if (!response.ok) {
    throw new Error('Failed to fetch credential')
  }
  const data: ApiResponse<IntegrationCredential> = await response.json()
  return data.data
}

/**
 * Update a credential
 */
export async function updateIntegrationCredential(
  integrationId: string,
  credentialId: string,
  request: UpdateIntegrationCredentialRequest
): Promise<IntegrationCredential> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/credentials/${credentialId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to update credential')
  }
  const data: ApiResponse<IntegrationCredential> = await response.json()
  return data.data
}

/**
 * Delete a credential
 */
export async function deleteIntegrationCredential(integrationId: string, credentialId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/credentials/${credentialId}`, {
    method: 'DELETE',
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to delete credential')
  }
}

/**
 * Check whether the workspace-level Slack bot is configured on the backend.
 */
export async function getSlackBotStatus(): Promise<{ configured: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/slack/status`)
  if (!response.ok) {
    return { configured: false }
  }
  return response.json() as Promise<{ configured: boolean }>
}

// Re-export types for convenience
export type {
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
} from '@viberglass/types'
