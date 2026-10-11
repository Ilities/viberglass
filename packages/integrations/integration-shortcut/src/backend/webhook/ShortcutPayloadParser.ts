import crypto from 'crypto'
import { isObjectRecord } from '@viberglass/types'
import { normalizeShortcutPayload } from './normalizeShortcutPayload'
import { mapShortcutEventType, normalizeAction, normalizeObjectType } from './shortcutEventKind'
import { buildShortcutMetadata, populateShortcutMetadata } from './shortcutMetadataBuilder'
import { toIdentifier, toNonEmptyString } from './shortcutValues'
import type { ParsedShortcutEvent, ShortcutWebhookPayload } from './shortcutWebhookTypes'

function validatePayloadForSupportedEvent(eventType: string, payload: ShortcutWebhookPayload): void {
  const data = payload.data
  if (eventType.startsWith('story_')) {
    if (!toIdentifier(data?.id)) throw new Error("Missing required field 'data.id'")
    if (eventType === 'story_created' && !toNonEmptyString(data?.name)) {
      throw new Error("Missing required field 'data.name'")
    }
    return
  }

  if (eventType.startsWith('comment_')) {
    if (!toIdentifier(data?.id)) throw new Error("Missing required field 'data.id'")
    if (!toIdentifier(data?.story_id)) throw new Error("Missing required field 'data.story_id'")
  }
}

function extractShortcutTimestamp(payload: ShortcutWebhookPayload): string {
  const data = payload.data
  return toNonEmptyString(data?.updated_at) || toNonEmptyString(data?.created_at) || new Date().toISOString()
}

/** Parses any of Shortcut's delivery formats into a story or comment event. */
export class ShortcutPayloadParser {
  parse(payload: unknown, headers: Record<string, string>): ParsedShortcutEvent {
    if (!isObjectRecord(payload)) throw new Error('Shortcut payload must be a JSON object')

    const normalized = normalizeShortcutPayload(payload)
    const data = normalized.payload
    const objectType = normalizeObjectType(data.object_type)
    const action = normalizeAction(data.action)
    if (!objectType) throw new Error("Missing required field 'object_type'")
    if (!action) throw new Error("Missing required field 'action'")

    const eventType = mapShortcutEventType(objectType, action)
    validatePayloadForSupportedEvent(eventType, data)

    const metadata = buildShortcutMetadata(normalized.source)
    metadata.action = action
    populateShortcutMetadata(data, metadata)

    const memberId = toNonEmptyString(data.member_id)
    if (memberId) metadata.sender = memberId

    return {
      eventType,
      deduplicationId: headers['x-shortcut-delivery'] || headers['x-request-id'] || crypto.randomUUID(),
      timestamp: extractShortcutTimestamp(data),
      metadata,
      payload: data,
    }
  }
}
