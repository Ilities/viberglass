import type { AuthCredentials, InboundComment, InboundIssue, InboundTask } from '@viberglass/types'

/** What routing and the delivery log need from an event, whatever sent it. */
export interface WebhookEventMetadata {
  projectId?: string
  repositoryId?: string
  issueKey?: string
  commentId?: string
  /** What happened to the subject: opened, edited, issue_commented and so on. */
  action?: string
  sender?: string
}

/** A delivery parsed into the parts every webhook shares. */
export interface InboundWebhookEvent {
  /** The sender's name for the event, such as "issues.opened" or "story_created". */
  eventType: string
  /** The sender's delivery id; a delivery seen before isn't processed twice. */
  deduplicationId: string
  timestamp: string
  payload: unknown
  metadata: WebhookEventMetadata
}

/** What Viberglass does with an event. */
export type InboundWebhookAction =
  | { kind: 'issue'; issue: InboundIssue }
  | { kind: 'comment'; comment: InboundComment }
  | { kind: 'task'; task: InboundTask }
  | { kind: 'ignored'; reason: string }

/** The webhook's own settings an integration reads events with. */
export interface WebhookReadSettings {
  /** The account whose mention asks the agent, and whose comments are never read back. */
  botUsername: string | null
}

/**
 * An integration's inbound webhook: how its deliveries are signed, parsed and
 * read. Everything else, from finding the webhook to de-duplicating and
 * recording deliveries, is the same for every integration.
 */
export interface WebhookReceiver {
  /**
   * Each of the connection's webhooks makes tasks in a space of its own. A
   * tracker's connection has one webhook instead, and spaces choose which of
   * its issues they take.
   */
  readonly targetsOneSpace: boolean
  /** The signature a delivery carries, from its (lower-cased) headers. */
  signatureOf(headers: Record<string, string>): string | undefined
  verifySignature(rawBody: Buffer, signature: string, secret: string): boolean
  /** Throws InvalidWebhookPayloadError when the sender should fix its request. */
  parseEvent(payload: unknown, headers: Record<string, string>): InboundWebhookEvent
  /** Headers that let a stored delivery be parsed again when it's retried. */
  retryHeaders(delivery: { deliveryId: string; eventType: string }): Record<string, string>
  read(event: InboundWebhookEvent, settings: WebhookReadSettings): InboundWebhookAction
  /**
   * Set when the sender sends a handshake before its events: the secret it
   * sent, which the webhook must echo back and keep to verify later signatures.
   */
  handshakeSecretOf?(headers: Record<string, string>): string | undefined
  /** Set when a delivery can carry several events: each one is parsed, verified and read on its own. */
  splitEvents?(payload: unknown): unknown[]
  /**
   * Set for events that don't carry what they change: fetches it with the
   * connection's credentials before `read`. A thrown error fails the delivery,
   * which can then be retried.
   */
  enrich?(event: InboundWebhookEvent, credentials: AuthCredentials): Promise<InboundWebhookEvent>
}
