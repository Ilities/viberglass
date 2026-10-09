import { isObjectRecord } from '@viberglass/types'
import { applyChangedFields, normalizeChangedFields } from './shortcutChanges'
import { actionFromEventType, normalizeAction, normalizeObjectType, objectTypeFromEventType } from './shortcutEventKind'
import { collectRefs } from './shortcutRefs'
import { getNestedRecord, toIdentifier, toNonEmptyString } from './shortcutValues'
import type { ShortcutWebhookObjectType, ShortcutWebhookPayload } from './shortcutWebhookTypes'

function getFirstAction(source: Record<string, unknown>): Record<string, unknown> | undefined {
  const actions = source.actions
  if (!Array.isArray(actions) || actions.length === 0) return undefined
  const firstAction = actions[0]
  return isObjectRecord(firstAction) ? firstAction : undefined
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
  const actionRecord = getFirstAction(source)
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
  const normalizedData = applyChangedFields(resolvedData, source, actionRecord)

  return {
    source,
    payload: {
      id: toNonEmptyString(source.id),
      event_type: eventType,
      object_type: objectType,
      action,
      member_id: toNonEmptyString(source.member_id) || toNonEmptyString(source.memberId),
      data: normalizedData || resolvedData,
      refs: collectRefs(source),
      changed_fields: changedFields,
    },
  }
}
