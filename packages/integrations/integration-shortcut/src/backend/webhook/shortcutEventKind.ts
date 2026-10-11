import type { ShortcutWebhookObjectType } from './shortcutWebhookTypes'
import { toNonEmptyString } from './shortcutValues'

function normalizeEventTypeToken(eventType: string): string {
  return eventType
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
}

export function objectTypeFromEventType(eventType: string): ShortcutWebhookObjectType | undefined {
  const normalized = normalizeEventTypeToken(eventType)
  if (normalized.includes('comment')) return 'comment'
  if (normalized.includes('story')) return 'story'
  return undefined
}

export function actionFromEventType(eventType: string): string | undefined {
  const normalized = normalizeEventTypeToken(eventType)
  if (normalized.includes('create')) return 'create'
  if (normalized.includes('update') || normalized.includes('change')) return 'update'
  if (normalized.includes('delete') || normalized.includes('remove')) return 'delete'
  return undefined
}

export function normalizeObjectType(objectType: unknown): ShortcutWebhookObjectType | undefined {
  if (objectType !== 'story' && objectType !== 'comment') return undefined
  return objectType
}

export function normalizeAction(action: unknown): string | undefined {
  const raw = toNonEmptyString(action)
  if (!raw) return undefined

  const normalized = raw.toLowerCase()
  switch (normalized) {
    case 'created':
      return 'create'
    case 'updated':
      return 'update'
    case 'deleted':
      return 'delete'
    default:
      return normalized
  }
}

const EVENT_TYPES: Record<string, string> = {
  story_create: 'story_created',
  story_update: 'story_updated',
  story_delete: 'story_deleted',
  comment_create: 'comment_created',
  comment_update: 'comment_updated',
  comment_delete: 'comment_deleted',
}

export function mapShortcutEventType(objectType: ShortcutWebhookObjectType, action: string): string {
  return EVENT_TYPES[`${objectType}_${action}`] || `${objectType}_${action}`
}
