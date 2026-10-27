import { verifySha256Hmac, type InboundWebhookAction, type InboundWebhookEvent, type WebhookReadSettings, type WebhookReceiver } from '@viberglass/integration-core'
import { asanaEventsOf, parseAsanaEvent } from './AsanaWebhookParser'
import { readAsanaEvent } from './readAsanaEvent'

/**
 * Asana's webhooks: a project subscription sends compact task and story
 * events, signed with an HMAC-SHA256 of the body in `X-Hook-Signature`. Asana
 * picks the signing secret itself and gives it in the `X-Hook-Secret` header
 * during the subscription handshake, which this echoes back.
 */
export class AsanaWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false
  readonly needsConnectionConfig = true

  handshake(headers: Record<string, string>): Record<string, string> | null {
    const secret = headers['x-hook-secret']
    return secret ? { 'X-Hook-Secret': secret } : null
  }

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-hook-signature']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  parseEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
    return parseAsanaEvent(payload, headers)
  }

  retryHeaders(delivery: { deliveryId: string; eventType: string }): Record<string, string> {
    return { 'x-asana-delivery': delivery.deliveryId, 'x-asana-event-type': delivery.eventType }
  }

  read(event: InboundWebhookEvent, settings: WebhookReadSettings): Promise<InboundWebhookAction> {
    return readAsanaEvent(event, settings)
  }

  /** Asana batches events into one delivery; read every task and comment in it. */
  async readAll(event: InboundWebhookEvent, settings: WebhookReadSettings): Promise<InboundWebhookAction[]> {
    const events = asanaEventsOf(event.payload)
    if (!events || events.length === 0) return [await readAsanaEvent(event, settings)]
    return Promise.all(
      events.map(async (asanaEvent, index) => {
        const single = parseAsanaEvent({ events: [asanaEvent] }, { 'x-asana-delivery': `${event.deduplicationId}:${index}` })
        return readAsanaEvent(single, settings)
      }),
    )
  }
}
