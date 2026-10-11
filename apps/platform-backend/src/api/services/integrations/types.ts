import type { DeliveryStatus, WebhookProvider } from '../../../persistence/webhook/WebhookDeliveryDAO'

export interface CreateIntegrationInput {
  name?: string
  system?: string
  config?: Record<string, unknown>
}

export interface UpdateIntegrationInput {
  name?: string
  config?: Record<string, unknown>
  isActive?: boolean
}

export interface LinkProjectIntegrationInput {
  integrationId?: string
  isPrimary?: boolean
}

export interface UpsertInboundWebhookConfigInput {
  /** Custom webhooks only: the space their tasks go to. */
  projectId?: string | null
  allowedEvents?: string[]
  /** Custom webhooks only. */
  planNewIssues?: boolean
  /** The tracker account whose mention in a comment asks the agent. */
  botUsername?: string | null
  webhookSecret?: string
  generateSecret?: boolean
  active?: boolean
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
