import { verifySha256Hmac } from '@viberglass/integration-core'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings, WebhookReceiver } from '@viberglass/integration-core'
import { asanaEventFromData, asanaEventData } from './asanaEvents'
import { readAsanaEvent, readAsanaEventAsync } from './readAsanaEvent'

type Fetch = typeof fetch

/**
 * Asana's task and comment webhooks. A delivery is signed with a hex HMAC-SHA256
 * of the body in `X-Hook-Signature`, arrives as a batch of events, and opens
 * with a handshake that hands over the secret to verify later deliveries with.
 */
export class AsanaWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false

  constructor(private readonly fetchImpl: Fetch = fetch) {}

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-hook-signature']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  /** Asana opens a webhook by a POST that carries its secret and no signature; echo it back. */
  handshake(headers: Record<string, string>): { secret: string } | undefined {
    const secret = headers['x-hook-secret']
    if (secret && !headers['x-hook-signature']) return { secret }
    return undefined
  }

  parseEvents(payload: unknown): InboundWebhookEvent[] {
    const events: InboundWebhookEvent[] = []
    for (const data of asanaEventData(payload)) {
      const event = asanaEventFromData(data)
      if (event) events.push(event)
    }
    return events
  }

  parseEvent(payload: unknown): InboundWebhookEvent {
    const [first] = this.parseEvents(payload)
    if (!first) throw new Error("Missing required field 'data.gid'")
    return first
  }

  retryHeaders(): Record<string, string> {
    // A stored delivery keeps the event's data, which parseEvent reads directly.
    return {}
  }

  read(event: InboundWebhookEvent, _settings: WebhookReadSettings): InboundWebhookAction {
    return readAsanaEvent(event)
  }

  readAsync(event: InboundWebhookEvent, settings: WebhookReadSettings): Promise<InboundWebhookAction> {
    return readAsanaEventAsync(event, settings, this.fetchImpl)
  }
}
