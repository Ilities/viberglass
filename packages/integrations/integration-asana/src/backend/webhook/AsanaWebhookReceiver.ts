import { verifySha256Hmac } from '@viberglass/integration-core'
import type { AuthCredentials } from '@viberglass/types'
import type { InboundWebhookAction, InboundWebhookEvent, WebhookReadSettings, WebhookReceiver } from '@viberglass/integration-core'
import { enrichAsanaEvent } from './enrichAsanaEvent'
import { parseAsanaEvent, splitAsanaEvents } from './parseAsanaEvent'
import { readAsanaEvent } from './readAsanaEvent'

/**
 * Asana's project webhooks. Asana sends a handshake with X-Hook-Secret, which
 * is echoed and kept, then signs each delivery's body with it in X-Hook-Signature.
 * A delivery carries several compact events, which are read one at a time.
 */
export class AsanaWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-hook-signature']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  handshakeSecretOf(headers: Record<string, string>): string | undefined {
    return headers['x-hook-secret']
  }

  splitEvents(payload: unknown): unknown[] {
    return splitAsanaEvents(payload)
  }

  parseEvent(payload: unknown, _headers: Record<string, string>): InboundWebhookEvent {
    return parseAsanaEvent(payload)
  }

  retryHeaders(_delivery: { deliveryId: string; eventType: string }): Record<string, string> {
    return {}
  }

  enrich(event: InboundWebhookEvent, credentials: AuthCredentials): Promise<InboundWebhookEvent> {
    return enrichAsanaEvent(event, credentials)
  }

  read(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
    return readAsanaEvent(event, settings)
  }
}
