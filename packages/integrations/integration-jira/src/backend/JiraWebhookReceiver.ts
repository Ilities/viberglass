import {
  verifySha256Hmac,
  type InboundWebhookAction,
  type InboundWebhookEvent,
  type WebhookReadSettings,
  type WebhookReceiver,
} from '@viberglass/integration-core'
import { parseJiraEvent } from './parseJiraEvent'
import { readJiraEvent } from './readJiraEvent'

/** Jira's issue and comment webhooks, signed with an HMAC-SHA256 of the body. */
export class JiraWebhookReceiver implements WebhookReceiver {
  readonly targetsOneSpace = false

  signatureOf(headers: Record<string, string>): string | undefined {
    return headers['x-atlassian-webhook-signature'] || headers['x-hub-signature']
  }

  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
    return verifySha256Hmac(rawBody, signature, secret)
  }

  parseEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent {
    return parseJiraEvent(payload, headers)
  }

  retryHeaders(delivery: { deliveryId: string; eventType: string }): Record<string, string> {
    return { 'x-atlassian-webhook-identifier': delivery.deliveryId }
  }

  read(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction {
    return readJiraEvent(event, settings)
  }
}
