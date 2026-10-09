import { verifySha256Hmac } from '@viberglass/integration-core'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings, WebhookReceiver } from '@viberglass/integration-core'
import { ShortcutPayloadParser } from './ShortcutPayloadParser'
import { readShortcutEvent } from './readShortcutEvent'

/** Shortcut's story and comment webhooks, signed with an HMAC-SHA256 of the body in `Payload-Signature`. */
export class ShortcutWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false

  constructor(private readonly payloadParser: ShortcutPayloadParser = new ShortcutPayloadParser()) {}

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['payload-signature']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  parseEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
    const parsed = this.payloadParser.parse(payload, headers)
    return {
      eventType: parsed.eventType,
      deduplicationId: parsed.deduplicationId,
      timestamp: parsed.timestamp,
      payload: parsed.payload,
      metadata: parsed.metadata,
    }
  }

  retryHeaders(delivery: { deliveryId: string; eventType: string }): Record<string, string> {
    return { 'x-shortcut-delivery': delivery.deliveryId }
  }

  read(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
    return readShortcutEvent(event, settings)
  }
}
