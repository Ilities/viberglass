import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  AuthCredentialType,
  CreateIntegrationRequest,
  Integration,
  IntegrationFieldType,
  IntegrationSummary,
  ProjectIntegrationLink,
  TestIntegrationResponse,
  TicketSystem,
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

export interface IntegrationSettingsListItem extends Omit<IntegrationSummary, 'id'> {
  id: string
  system: TicketSystem
  integrationEntityId?: string
  integrationName?: string
}

/**
 * Get integration cards for global settings with explicit entity ids for configured integrations.
 */
export async function getIntegrationSettingsListItems(): Promise<IntegrationSettingsListItem[]> {
  const [availableTypes, allIntegrations] = await Promise.all([
    getAvailableIntegrationTypes(),
    getIntegrations(),
  ])

  const integrationsBySystem = new Map<TicketSystem, Integration[]>()
  for (const integration of allIntegrations) {
    const existing = integrationsBySystem.get(integration.system)
    if (existing) {
      existing.push(integration)
    } else {
      integrationsBySystem.set(integration.system, [integration])
    }
  }

  const items: IntegrationSettingsListItem[] = []

  for (const type of availableTypes) {
    const configured = integrationsBySystem.get(type.id) ?? []

    if (configured.length === 0) {
      items.push({
        id: `new:${type.id}`,
        system: type.id,
        label: type.label,
        category: type.category,
        description: type.description,
        authTypes: type.authTypes,
        configFields: type.configFields,
        supports: type.supports,
        status: type.status,
        configStatus: type.status === 'stub' ? 'stub' : 'not_configured',
      })
      continue
    }

    for (const integration of configured) {
      items.push({
        id: integration.id,
        system: type.id,
        integrationEntityId: integration.id,
        integrationName: integration.name,
        label: type.label,
        category: type.category,
        description: type.description,
        authTypes: type.authTypes,
        configFields: type.configFields,
        supports: type.supports,
        status: type.status,
        configStatus: 'configured',
        configuredAt: integration.createdAt,
      })
    }
  }

  return items
}

// ============================================================================
// Webhook configuration under integrations
// ============================================================================

export interface IntegrationInboundWebhookConfig {
  id: string
  provider: string
  webhookUrl: string
  events: string[]
  autoExecute: boolean
  active: boolean
  hasSecret: boolean
  webhookSecret?: string
  providerProjectId?: string | null
  projectId?: string | null
  createdAt: string
  updatedAt: string
}

export interface IntegrationOutboundWebhookConfig {
  id: string
  provider: string
  events: string[]
  active: boolean
  hasApiToken: boolean
  providerProjectId: string | null
  projectId?: string | null
  name?: string
  targetUrl?: string
  method?: 'POST' | 'PUT' | 'PATCH'
  headers?: Record<string, string>
  auth?: {
    type: 'none' | 'bearer' | 'basic' | 'header'
    username?: string
    headerName?: string
    hasToken?: boolean
    hasPassword?: boolean
    hasHeaderValue?: boolean
  }
  hasSigningSecret?: boolean
  signatureAlgorithm?: 'sha256' | 'sha1' | null
  retryPolicy?: {
    maxAttempts: number
    backoffMs: number
    maxBackoffMs: number
  }
  createdAt: string
  updatedAt: string
}

export interface IntegrationOutboundWebhookTestResult {
  success: boolean
  message: string
  statusCode?: number
}

export interface IntegrationWebhookDelivery {
  id: string
  provider: string
  webhookConfigId: string | null
  deliveryId: string
  eventType: string
  status: 'pending' | 'processing' | 'succeeded' | 'failed'
  retryable: boolean
  errorMessage: string | null
  ticketId: string | null
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
  return data.data
}

/**
 * Create inbound webhook config for an integration
 */
export async function createIntegrationInboundWebhook(
  integrationEntityId: string,
  config: {
    events?: string[]
    autoExecute?: boolean
    webhookSecret?: string
    generateSecret?: boolean
    providerProjectId?: string | null
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
        autoExecute: config.autoExecute,
        webhookSecret: config.webhookSecret,
        generateSecret: config.generateSecret,
        providerProjectId: config.providerProjectId,
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
  return data.data
}

/**
 * Update inbound webhook config
 */
export async function updateIntegrationInboundWebhook(
  integrationEntityId: string,
  configId: string,
  config: {
    events?: string[]
    autoExecute?: boolean
    webhookSecret?: string
    generateSecret?: boolean
    providerProjectId?: string | null
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
        autoExecute: config.autoExecute,
        webhookSecret: config.webhookSecret,
        generateSecret: config.generateSecret,
        providerProjectId: config.providerProjectId,
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
  return data.data
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

export async function getIntegrationOutboundWebhooks(
  integrationEntityId: string
): Promise<IntegrationOutboundWebhookConfig[]> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound`
  )
  if (!response.ok) {
    throw new Error('Failed to fetch outbound webhook')
  }
  const data: ApiResponse<IntegrationOutboundWebhookConfig[]> = await response.json()
  return data.data
}

/**
 * Get the first outbound webhook config for an integration (current UI behavior).
 */
export async function getIntegrationOutboundWebhook(
  integrationEntityId: string
): Promise<IntegrationOutboundWebhookConfig | null> {
  const configs = await getIntegrationOutboundWebhooks(integrationEntityId)
  return configs[0] || null
}

/**
 * Create or update outbound webhook config for an integration
 */
export async function saveIntegrationOutboundWebhook(
  integrationEntityId: string,
  config: {
    events?: string[]
    apiToken?: string
    providerProjectId?: string | null
    projectId?: string | null
    active?: boolean
    name?: string
    targetUrl?: string
    method?: 'POST' | 'PUT' | 'PATCH'
    headers?: Record<string, string>
    auth?: {
      type: 'none' | 'bearer' | 'basic' | 'header'
      token?: string
      username?: string
      password?: string
      headerName?: string
      headerValue?: string
    }
    signingSecret?: string | null
    signatureAlgorithm?: 'sha256' | 'sha1'
    retryPolicy?: {
      maxAttempts: number
      backoffMs: number
      maxBackoffMs: number
    }
  },
  configId?: string
): Promise<IntegrationOutboundWebhookConfig> {
  const targetUrl = configId
    ? `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound/${configId}`
    : `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound`

  const response = await apiFetch(
    targetUrl,
    {
      method: configId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        events: config.events,
        apiToken: config.apiToken,
        providerProjectId: config.providerProjectId,
        projectId: config.projectId,
        active: config.active,
        name: config.name,
        targetUrl: config.targetUrl,
        method: config.method,
        headers: config.headers,
        auth: config.auth,
        signingSecret: config.signingSecret,
        signatureAlgorithm: config.signatureAlgorithm,
        retryPolicy: config.retryPolicy,
      }),
    }
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to save outbound webhook')
  }
  const data: ApiResponse<IntegrationOutboundWebhookConfig> = await response.json()
  return data.data
}

export async function testIntegrationOutboundWebhook(
  integrationEntityId: string,
  configId: string,
  eventType?: 'job_started' | 'job_ended'
): Promise<IntegrationOutboundWebhookTestResult> {
  const endpointPaths = [
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound/${configId}/test`,
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound/${configId}/test-send`,
  ]

  let lastResponse: Response | null = null
  for (const endpoint of endpointPaths) {
    const response = await apiFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(eventType ? { eventType } : {}),
    })

    if (response.status === 404) {
      lastResponse = response
      continue
    }

    const payload = await response.json().catch(() => ({} as Record<string, unknown>))
    if (!response.ok) {
      return {
        success: false,
        message:
          (typeof payload.message === 'string' && payload.message) ||
          (typeof payload.error === 'string' && payload.error) ||
          'Test send failed',
        statusCode: response.status,
      }
    }

    const data =
      payload &&
      typeof payload === 'object' &&
      'data' in payload &&
      payload.data &&
      typeof payload.data === 'object'
        ? (payload.data as Record<string, unknown>)
        : payload

    return {
      success: data?.success === true,
      message: typeof data?.message === 'string' && data.message ? data.message : 'Test send completed',
      statusCode: response.status,
    }
  }

  return {
    success: false,
    message: 'Test send endpoint is not available',
    statusCode: lastResponse?.status,
  }
}

/**
 * Delete outbound webhook config for an integration
 */
export async function deleteIntegrationOutboundWebhook(
  integrationEntityId: string,
  configId: string
): Promise<void> {
  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound/${configId}`,
    { method: 'DELETE' }
  )
  if (!response.ok) {
    throw new Error('Failed to delete outbound webhook')
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
    statuses?: Array<'pending' | 'processing' | 'succeeded' | 'failed'>
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

export async function getIntegrationOutboundDeliveries(
  integrationEntityId: string,
  outboundConfigId: string,
  options: {
    limit?: number
    statuses?: Array<'pending' | 'processing' | 'succeeded' | 'failed'>
  } = {}
): Promise<IntegrationWebhookDelivery[]> {
  const limit = options.limit ?? 50
  const query = new URLSearchParams({ limit: String(limit) })
  if (options.statuses && options.statuses.length > 0) {
    query.set('statuses', options.statuses.join(','))
  }

  const response = await apiFetch(
    `${API_BASE_URL}/api/integrations/${integrationEntityId}/webhooks/outbound/${outboundConfigId}/deliveries?${query.toString()}`
  )
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to fetch outbound deliveries')
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

// Re-export types for convenience
export type {
  ConfigureIntegrationRequest,
  IntegrationConfig,
  IntegrationSummary,
  TestIntegrationResponse,
} from '@viberglass/types'
