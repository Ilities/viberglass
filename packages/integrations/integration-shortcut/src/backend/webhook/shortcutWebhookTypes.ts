import type { WebhookEventMetadata } from '@viberglass/integration-core'

export type ShortcutWebhookObjectType = 'story' | 'comment'

export interface ShortcutRef {
  id?: number
  entity_type?: string
  name?: string
}

/** A delivery in the one shape the receiver reads, whichever of Shortcut's formats it came in. */
export interface ShortcutWebhookPayload {
  id?: string
  object_type?: ShortcutWebhookObjectType | string
  event_type?: string
  action?: string
  member_id?: string
  data?: Record<string, unknown>
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
