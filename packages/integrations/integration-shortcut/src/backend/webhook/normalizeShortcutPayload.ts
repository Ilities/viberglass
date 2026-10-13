import { isObjectRecord } from '@viberglass/types'
import { applyChangedFields, normalizeChangedFields } from './shortcutChanges'
import { actionFromEventType, normalizeAction, normalizeObjectType, objectTypeFromEventType } from './shortcutEventKind'
import { withCommentStory } from './shortcutCommentStory'
import { collectRefs } from './shortcutRefs'
import { getNestedRecord, toIdentifier, toNonEmptyString } from './shortcutValues'
import type { ShortcutWebhookObjectType, ShortcutWebhookPayload } from './shortcutWebhookTypes'

/** The action on the delivery's primary entity, else the first; a comment's delivery also updates its story. */
function getPrimaryAction(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const actions = Array.isArray(source.actions) ? source.actions.filter(isObjectRecord) : []
  const primaryId = toIdentifier(source.primary_id)
  return (primaryId ? actions.find((action) => toIdentifier(action.id) === primaryId) : undefined) ?? actions[0]
}

function parseNestedPayload(value: unknown): Record<string, unknown> | undefined {
  if (isObjectRecord(value)) return value
  if (typeof value !== 'string') return undefined

  try {
    const parsed: unknown = JSON.parse(value)
    return isObjectRecord(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

function unwrapShortcutPayload(payload: Record<string, unknown>, depth = 0): Record<string, unknown> {
  if (depth >= 3) return payload
  const nestedPayload = parseNestedPayload(payload.payload)
  if (!nestedPayload) return payload
  return unwrapShortcutPayload(nestedPayload, depth + 1)
}

function resolveData(
  source: Record<string, unknown>,
  objectType: ShortcutWebhookObjectType | undefined,
  actionRecord: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const data = getNestedRecord(source, 'data')
  if (data) return data

  const actionData = getNestedRecord(actionRecord, 'data')
  if (actionData) return actionData

  const actionId = toIdentifier(actionRecord?.id)
  const actionStoryId = toIdentifier(actionRecord?.story_id)
  if (actionRecord && (actionId || actionStoryId)) return actionRecord

  if (objectType === 'comment') return getNestedRecord(source, 'comment')
  if (objectType === 'story') return getNestedRecord(source, 'story')
  return getNestedRecord(source, 'story') || getNestedRecord(source, 'comment')
}

/**
 * Brings Shortcut's delivery formats (the current one, the v1 `actions` list,
 * the legacy `event_type` with a `story` or `comment`, and any of them wrapped
 * in a `payload` string) into one shape. `source` is the unwrapped delivery.
 */
export function normalizeShortcutPayload(sourcePayload: Record<string, unknown>): {
  source: Record<string, unknown>
  payload: ShortcutWebhookPayload
} {
  const source = unwrapShortcutPayload(sourcePayload)
  const actionRecord = getPrimaryAction(source)
  const eventType =
    toNonEmptyString(source.event_type) ||
    toNonEmptyString(source.eventType) ||
    toNonEmptyString(actionRecord?.event_type) ||
    toNonEmptyString(actionRecord?.eventType)

  const objectType =
    normalizeObjectType(source.object_type) ||
    normalizeObjectType(source.entity_type) ||
    normalizeObjectType(actionRecord?.object_type) ||
    normalizeObjectType(actionRecord?.entity_type) ||
    (eventType ? objectTypeFromEventType(eventType) : undefined)

  const action =
    normalizeAction(source.action) ||
    normalizeAction(actionRecord?.action) ||
    (eventType ? actionFromEventType(eventType) : undefined)
  const changedFields =
    normalizeChangedFields(source.changed_fields) ||
    normalizeChangedFields(source.changedFields) ||
    normalizeChangedFields(actionRecord?.changed_fields) ||
    normalizeChangedFields(actionRecord?.changedFields)
  const resolvedData = resolveData(source, objectType, actionRecord)
  const normalizedData = applyChangedFields(resolvedData, source, actionRecord) || resolvedData
  const changes = getNestedRecord(actionRecord, 'changes') || getNestedRecord(source, 'changes')

  return {
    source,
    payload: {
      id: toNonEmptyString(source.id),
      event_type: eventType,
      object_type: objectType,
      action,
      member_id: toNonEmptyString(source.member_id) || toNonEmptyString(source.memberId),
      actor_name: toNonEmptyString(source.actor_name),
      data: objectType === 'comment' ? withCommentStory(normalizedData, source) : normalizedData,
      ...(changes ? { changes } : {}),
      refs: collectRefs(source),
      changed_fields: changedFields,
    },
  }
}
