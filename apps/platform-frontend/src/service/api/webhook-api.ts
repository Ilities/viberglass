import { API_BASE_URL } from '@/lib'

// Types for webhook configuration and delivery

export type SecretLocation = 'database' | 'ssm' | 'env'
export type WebhookProvider = 'github' | 'jira'
export type WebhookDeliveryStatus = 'pending' | 'processing' | 'succeeded' | 'failed'

export interface WebhookConfig {
  id: string
  projectId: string | null
  provider: WebhookProvider
  providerProjectId: string | null
  secretLocation: SecretLocation
  secretPath: string | null
  webhookSecretEncrypted: string | null
  apiTokenEncrypted: string | null
  allowedEvents: string[]
  autoExecute: boolean
  botUsername: string | null
  labelMappings: Record<string, unknown>
  active: boolean
  createdAt: Date
  updatedAt: Date
}

export interface CreateWebhookConfigDTO {
  projectId?: string | null
  provider: WebhookProvider
  providerProjectId?: string | null
  secretLocation?: SecretLocation
  secretPath?: string | null
  webhookSecret?: string | null
  apiToken?: string | null
  allowedEvents?: string[]
  autoExecute?: boolean
  botUsername?: string | null
  labelMappings?: Record<string, unknown>
  active?: boolean
}

export interface UpdateWebhookConfigDTO {
  projectId?: string | null
  provider?: WebhookProvider
  providerProjectId?: string | null
  secretLocation?: SecretLocation
  secretPath?: string | null
  webhookSecret?: string | null
  apiToken?: string | null
  allowedEvents?: string[]
  autoExecute?: boolean
  botUsername?: string | null
  labelMappings?: Record<string, unknown>
  active?: boolean
}

export interface WebhookDelivery {
  id: string
  provider: WebhookProvider
  deliveryId: string
  eventType: string
  status: WebhookDeliveryStatus
  errorMessage: string | null
  ticketId: string | null
  createdAt: Date
  processedAt: Date | null
}

export interface TestResult {
  success: boolean
  message: string
}

export interface RetryResult {
  success: boolean
  ticketId?: string
  jobId?: string
  message: string
}

export interface DeliveryStatus {
  status: string
  providers: {
    github: {
      configured: boolean
      stats: {
        total: number
        succeeded: number
        failed: number
      } | null
    }
    jira: {
      configured: boolean
      stats: {
        total: number
        succeeded: number
        failed: number
      } | null
    }
  }
  failedDeliveries: {
    count: number
    recent: Array<{
      id: string
      deliveryId: string
      eventType: string
      errorMessage: string | null
      createdAt: Date
    }>
  }
}

// Webhook API functions

export async function getWebhookConfigs(projectId?: string): Promise<WebhookConfig[]> {
  const url = projectId
    ? `${API_BASE_URL}/api/webhooks/configs?projectId=${projectId}`
    : `${API_BASE_URL}/api/webhooks/configs`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error('Failed to fetch webhook configurations')
  }

  const data = await response.json()
  return (data.configs || []).map((c: WebhookConfig) => ({
    ...c,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  }))
}

export async function createWebhookConfig(config: CreateWebhookConfigDTO): Promise<WebhookConfig> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/configs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      provider: config.provider,
      providerProjectId: config.providerProjectId || null,
      projectId: config.projectId || null,
      secretLocation: config.secretLocation || 'database',
      webhookSecret: config.webhookSecret || null,
      apiToken: config.apiToken || null,
      allowedEvents: config.allowedEvents || ['issues', 'issue_comment'],
      autoExecute: config.autoExecute || false,
      botUsername: config.botUsername || null,
      labelMappings: config.labelMappings || {},
      active: config.active !== false,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to create webhook configuration')
  }

  const data = await response.json()
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

export async function updateWebhookConfig(id: string, config: UpdateWebhookConfigDTO): Promise<WebhookConfig> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/configs/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(config),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || error.error || 'Failed to update webhook configuration')
  }

  const data = await response.json()
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  }
}

export async function deleteWebhookConfig(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/configs/${id}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error('Failed to delete webhook configuration')
  }
}

export async function testWebhookConfig(configId: string): Promise<TestResult> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/configs/${configId}/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    return {
      success: false,
      message: error.message || error.error || 'Test failed',
    }
  }

  return await response.json()
}

export async function getFailedDeliveries(limit: number = 50): Promise<WebhookDelivery[]> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/deliveries?status=failed&limit=${limit}`)
  if (!response.ok) {
    throw new Error('Failed to fetch failed deliveries')
  }

  const data = await response.json()
  return (data.deliveries || []).map((d: WebhookDelivery) => ({
    ...d,
    createdAt: new Date(d.createdAt),
    processedAt: d.processedAt ? new Date(d.processedAt) : null,
  }))
}

export async function retryDelivery(deliveryId: string): Promise<RetryResult> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/deliveries/${deliveryId}/retry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    return {
      success: false,
      message: error.message || error.error || 'Retry failed',
    }
  }

  return await response.json()
}

export async function getDeliveryStatus(): Promise<DeliveryStatus> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/status`)
  if (!response.ok) {
    throw new Error('Failed to fetch delivery status')
  }

  return await response.json()
}

// All types are already exported above
