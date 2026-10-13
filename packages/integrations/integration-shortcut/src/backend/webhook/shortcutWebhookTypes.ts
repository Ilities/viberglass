import type { WebhookEventMetadata } from '@viberglass/integration-core'

export type ShortcutWebhookObjectType = 'story' | 'comment'

export interface ShortcutRef {
  id?: number
  entity_type?: string
  name?: string
  /** A workflow state's kind: unstarted, started or done. */
  type?: string
}

/** A delivery in the one shape the receiver reads, whichever of Shortcut's formats it came in. */
export interface ShortcutWebhookPayload {
  id?: string
  object_type?: ShortcutWebhookObjectType | string
  event_type?: string
  action?: string
  member_id?: string
  /** The name of the member who made the change, which Shortcut's v1 deliveries carry. */
  actor_name?: string
  data?: Record<string, unknown>
  /** An update's changes as Shortcut sends them, each field's old and new value. */
  changes?: Record<string, unknown>
  refs?: ShortcutRef[]
  changed_fields?: string[]
}

export interface ParsedShortcutEvent {
  eventType: string
  deduplicationId: string
  timestamp: string
  metadata: WebhookEventMetadata
  payload: ShortcutWebhookPayload
}
