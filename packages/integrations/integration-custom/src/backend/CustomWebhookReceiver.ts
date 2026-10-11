import crypto from 'crypto'
import {
  field,
  InvalidWebhookPayloadError,
  stringAt,
  verifySha256Hmac,
  type InboundWebhookAction,
  type InboundWebhookEvent,
  type WebhookReceiver,
} from '@viberglass/integration-core'
import type { Severity } from '@viberglass/types'

const TICKET_CREATED = 'ticket_created'
const SEVERITIES: readonly Severity[] = ['low', 'medium', 'high', 'critical']

function isSeverity(value: unknown): value is Severity {
  return SEVERITIES.some((severity) => severity === value)
}

function presentString(source: unknown, key: string): string | undefined {
  const value = field(source, key)
  return typeof value === 'string' && value ? value : undefined
}

/** Any system creates a task in the webhook's space by posting a fixed JSON shape. */
export class CustomWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = true

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-webhook-signature-256']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  parseEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
    if (!presentString(payload, 'title')) {
      throw new InvalidWebhookPayloadError('Missing required field: title')
    }
    if (!presentString(payload, 'description')) {
      throw new InvalidWebhookPayloadError('Missing required field: description')
    }
    const severity = field(payload, 'severity')
    if (severity && !isSeverity(severity)) {
      throw new InvalidWebhookPayloadError('Invalid severity. Must be: low, medium, high, or critical')
    }

    return {
      eventType: TICKET_CREATED,
      deduplicationId: headers['x-webhook-delivery-id'] || crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      payload,
      metadata: {
        issueKey: presentString(payload, 'externalId'),
        action: 'created',
      },
    }
  }

  retryHeaders(delivery: { deliveryId: string; eventType: string }): Record<string, string> {
    return { 'x-webhook-delivery-id': delivery.deliveryId }
  }

  read(event: InboundWebhookEvent): InboundWebhookAction {
    if (event.eventType !== TICKET_CREATED) {
      return { kind: 'ignored', reason: `Custom webhooks only create tasks, not ${event.eventType} events` }
    }
    const { payload } = event
    const severity = field(payload, 'severity')
    return {
      kind: 'task',
      task: {
        title: presentString(payload, 'title') ?? '',
        description: presentString(payload, 'description') ?? '',
        severity: isSeverity(severity) ? severity : 'medium',
        category: presentString(payload, 'category') ?? 'bug',
        externalId: presentString(payload, 'externalId'),
        url: presentString(payload, 'url'),
      },
    }
  }
}
