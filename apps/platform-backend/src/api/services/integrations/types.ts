import type { AuthCredentialType } from '@viberglass/types'
import type { DeliveryStatus, WebhookProvider } from '../../../persistence/webhook/WebhookDeliveryDAO'

export interface CreateIntegrationInput {
  name?: string
  system?: string
  authType?: AuthCredentialType
  values?: Record<string, unknown>
}

export interface UpdateIntegrationInput {
  name?: string
  authType?: AuthCredentialType
  values?: Record<string, unknown>
  isActive?: boolean
}

export interface LinkProjectIntegrationInput {
  integrationId?: string
  isPrimary?: boolean
}

export interface UpsertInboundWebhookConfigInput {
  projectId?: string | null
  allowedEvents?: string[]
  autoExecute?: boolean
  webhookSecret?: string
  generateSecret?: boolean
  providerProjectId?: string | null
  labelMappings?: Record<string, unknown>
  active?: boolean
}

export interface UpsertOutboundWebhookConfigInput {
  projectId?: string | null
  events?: string[]
  apiToken?: string
  providerProjectId?: string | null
  active?: boolean
  outboundTargetConfig?: Record<string, unknown>
  name?: string
  targetUrl?: string
  method?: string
  headers?: Record<string, string>
  auth?: Record<string, unknown>
  signingSecret?: string | null
  signatureAlgorithm?: string
  retryPolicy?: Record<string, unknown>
}

export interface DeliveryListResult {
  data: Array<{
    id: string
    provider: WebhookProvider
    webhookConfigId: string | null
    deliveryId: string
    eventType: string
    status: DeliveryStatus
    retryable: boolean
    errorMessage: string | null
    ticketId: string | null
    createdAt: Date
    processedAt: Date | null
  }>
  pagination: {
    limit: number
    offset: number
    count: number
  }
}

export interface RetryInboundDeliveryResult {
  message: string
  data: {
    delivery: {
      id: string
      provider: WebhookProvider
      webhookConfigId: string | null
      deliveryId: string
      eventType: string
      status: DeliveryStatus
      retryable: boolean
      errorMessage: string | null
      ticketId: string | null
      createdAt: Date
      processedAt: Date | null
    }
    retry: {
      status: 'processed' | 'ignored' | 'failed' | 'duplicate'
      reason?: string
      ticketId?: string
      jobId?: string
    }
  }
}
