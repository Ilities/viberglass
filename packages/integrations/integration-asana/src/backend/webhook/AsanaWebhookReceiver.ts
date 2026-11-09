import crypto from 'crypto'
import { InvalidWebhookPayloadError, verifySha256Hmac } from '@viberglass/integration-core'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings, WebhookReceiver } from '@viberglass/integration-core'
import { AsanaEventReader } from './AsanaEventReader'
import type { AsanaEvent } from './asanaWebhookTypes'
import type { AuthCredentials } from '@viberglass/types'

interface AsanaWebhookPayload {
  events: AsanaEvent[]
  timestamp?: string
}

/** Verifies and parses Asana's signed, batched project webhook deliveries. */
export class AsanaWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false

  constructor(private readonly readerFactory = (credentials: AuthCredentials) => new AsanaEventReader(credentials)) {}

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-hook-signature']
  }

  handshakeHeaders(headers: Record<string, string>): Record<string, string> | undefined {
    const secret = headers['x-hook-secret']
    return secret ? { 'X-Hook-Secret': secret } : undefined
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  parseEvent(payload: unknown, _headers: Record<string, string>): InboundWebhookEvent {
    if (!isAsanaWebhookPayload(payload)) {
      throw new InvalidWebhookPayloadError('Asana webhook payload must contain an events array')
    }
    const events: AsanaEvent[] = []
    for (const raw of payload.events) if (isAsanaEvent(raw)) events.push(raw)
    const timestamp = events.find((event) => event.created_at)?.created_at ?? new Date().toISOString()
    return {
      eventType: 'asana_batch',
      deduplicationId: crypto.randomUUID(),
      timestamp,
      payload: { events, timestamp },
      metadata: {},
    }
  }

  retryHeaders(): Record<string, string> {
    return {}
  }

  async read(event: InboundWebhookEvent, settings: WebhookReadSettings): Promise<InboundWebhookAction[]> {
    const payload = event.payload as AsanaWebhookPayload
    const events = payload.events
    if (events.length === 0) return [{ kind: 'ignored', reason: 'Asana heartbeat received' }]
    if (!settings.credentials) return [{ kind: 'ignored', reason: 'Asana connection credentials are unavailable' }]
    return this.readerFactory(settings.credentials).readBatch(events, settings)
  }
}

function isAsanaWebhookPayload(payload: unknown): payload is { events: unknown[] } {
  return typeof payload === 'object' && payload !== null && 'events' in payload && Array.isArray(payload.events)
}

function isAsanaEvent(value: unknown): value is AsanaEvent {
  return typeof value === 'object' && value !== null && 'resource' in value &&
    typeof value.resource === 'object' && value.resource !== null
}
