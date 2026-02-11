import type { ParsedQs } from 'qs'
import { parseCustomOutboundTargetConfig, readCustomOutboundTargetConfig, toPublicCustomOutboundTargetConfig } from '../../../webhooks/feedback/customOutboundTargetConfig'
import type { WebhookProvider } from '../../../persistence/webhook/WebhookConfigDAO'
import type { DeliveryStatus } from '../../../persistence/webhook/WebhookDeliveryDAO'

export function mapSystemToWebhookProvider(system: string): WebhookProvider | null {
  if (system === 'github' || system === 'jira' || system === 'shortcut' || system === 'custom') {
    return system
  }
  return null
}

export function getDefaultInboundEvents(provider: WebhookProvider): string[] {
  switch (provider) {
    case 'github':
      return ['issues.opened', 'issue_comment.created']
    case 'jira':
      return ['issue_created', 'issue_updated', 'comment_created']
    case 'shortcut':
      return ['story_created', 'story_updated', 'comment_created']
    case 'custom':
      return ['ticket_created']
    default:
      return ['*']
  }
}

export function getDefaultOutboundEvents(): string[] {
  return ['job_started', 'job_ended']
}

export function getProviderProjectIdFromIntegration(
  provider: WebhookProvider,
  integrationValues: Record<string, unknown>,
): string | null {
  if (provider === 'github') {
    const owner = typeof integrationValues.owner === 'string' ? integrationValues.owner : null
    const repo = typeof integrationValues.repo === 'string' ? integrationValues.repo : null
    if (owner && repo) {
      return `${owner}/${repo}`
    }
    return null
  }

  if (provider === 'jira') {
    const projectKey =
      typeof integrationValues.projectKey === 'string' ? integrationValues.projectKey : null
    return projectKey
  }

  if (provider === 'shortcut') {
    const projectId =
      typeof integrationValues.projectId === 'string'
        ? integrationValues.projectId
        : typeof integrationValues.projectId === 'number'
          ? String(integrationValues.projectId)
          : null
    return projectId
  }

  return null
}

export function serializeInboundWebhookConfig(
  config: {
    id: string
    provider: WebhookProvider
    allowedEvents: string[]
    autoExecute: boolean
    active: boolean
    webhookSecretEncrypted: string | null
    createdAt: Date
    updatedAt: Date
  },
  includeSecret?: string,
) {
  return {
    id: config.id,
    provider: config.provider,
    webhookUrl:
      config.provider === 'custom'
        ? `/api/webhooks/custom/${config.id}`
        : `/api/webhooks/${config.provider}`,
    events: config.allowedEvents,
    autoExecute: config.autoExecute,
    active: config.active,
    hasSecret: Boolean(config.webhookSecretEncrypted),
    webhookSecret: includeSecret,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

export function serializeOutboundWebhookConfig(
  config: {
    id: string
    provider: WebhookProvider
    allowedEvents: string[]
    active: boolean
    apiTokenEncrypted: string | null
    providerProjectId: string | null
    outboundTargetConfig?: Record<string, unknown> | null
    createdAt: Date
    updatedAt: Date
  },
): Record<string, unknown> {
  const customTarget =
    config.provider === 'custom'
      ? readCustomOutboundTargetConfig(config.outboundTargetConfig || null)
      : null

  return {
    id: config.id,
    provider: config.provider,
    events: config.allowedEvents,
    active: config.active,
    hasApiToken: Boolean(config.apiTokenEncrypted),
    providerProjectId: config.providerProjectId,
    ...(customTarget ? toPublicCustomOutboundTargetConfig(customTarget) : {}),
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  }
}

export function serializeWebhookDelivery(
  delivery: {
    id: string
    provider: WebhookProvider
    webhookConfigId: string | null
    deliveryId: string
    eventType: string
    status: 'pending' | 'processing' | 'succeeded' | 'failed'
    errorMessage: string | null
    ticketId: string | null
    createdAt: Date
    processedAt: Date | null
  },
) {
  return {
    id: delivery.id,
    provider: delivery.provider,
    webhookConfigId: delivery.webhookConfigId,
    deliveryId: delivery.deliveryId,
    eventType: delivery.eventType,
    status: delivery.status,
    retryable: delivery.status === 'failed',
    errorMessage: delivery.errorMessage,
    ticketId: delivery.ticketId,
    createdAt: delivery.createdAt,
    processedAt: delivery.processedAt,
  }
}

export function parseNonNegativeInt(value: unknown, fallback: number): number {
  const candidate = Array.isArray(value) ? value[0] : value
  if (typeof candidate !== 'string') {
    return fallback
  }

  const parsed = Number.parseInt(candidate, 10)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback
  }

  return parsed
}

const VALID_DELIVERY_STATUSES: DeliveryStatus[] = ['pending', 'processing', 'succeeded', 'failed']

function splitQueryValues(value: unknown): string[] {
  if (typeof value === 'string') {
    return value.split(',')
  }

  if (Array.isArray(value)) {
    return value.flatMap((nested) => splitQueryValues(nested))
  }

  return []
}

export function parseDeliveryStatuses(query: ParsedQs | Record<string, unknown>): {
  statuses?: DeliveryStatus[]
  invalidValues: string[]
} {
  const rawValues = [query.statuses, query.status]
    .flatMap((value) => splitQueryValues(value))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean)

  if (rawValues.length === 0) {
    return { invalidValues: [] }
  }

  const uniqueValues = Array.from(new Set(rawValues))
  const invalidValues = uniqueValues.filter(
    (value) => !VALID_DELIVERY_STATUSES.includes(value as DeliveryStatus),
  )
  if (invalidValues.length > 0) {
    return { invalidValues }
  }

  return {
    statuses: uniqueValues as DeliveryStatus[],
    invalidValues: [],
  }
}

export function parseCustomOutboundTargetConfigOrError(
  body: unknown,
  options: {
    existing?: Record<string, unknown> | null
    requireNameAndUrl?: boolean
  } = {},
): { config?: Record<string, unknown>; error?: string } {
  const existingConfig = options.existing
    ? readCustomOutboundTargetConfig(options.existing)
    : null
  const parsed = parseCustomOutboundTargetConfig(body, {
    existing: existingConfig,
    requireNameAndUrl: options.requireNameAndUrl ?? false,
  })
  if (!parsed.config) {
    return {
      error: parsed.error || 'Invalid custom outbound target configuration',
    }
  }

  return {
    config: parsed.config as unknown as Record<string, unknown>,
  }
}
