import type {
  InboundWebhookAction,
  InboundWebhookEvent,
  WebhookReadSettings,
  WebhookReceiver,
} from '@viberglass/integration-core'
import { verifySha256Hmac } from '@viberglass/integration-core'
import { parseGitHubEvent } from './parseGitHubEvent'
import { readGitHubEvent } from './readGitHubEvent'

/** GitHub's issue webhooks, signed with an HMAC-SHA256 of the body. */
export class GitHubWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-hub-signature-256'] || headers['x-hub-signature']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  parseEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
    return parseGitHubEvent(payload, headers)
  }

  /** The stored event type carries the action, which GitHub sends in the body instead. */
  retryHeaders(delivery: { deliveryId: string; eventType: string }): Record<string, string> {
    return {
      'x-github-event': delivery.eventType.split('.')[0],
      'x-github-delivery': delivery.deliveryId,
    }
  }

  read(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
    return readGitHubEvent(event, settings)
  }
}
