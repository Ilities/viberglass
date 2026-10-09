import { isObjectRecord } from '@viberglass/types'
import type { ShortcutRef } from './shortcutWebhookTypes'
import { toInteger, toNonEmptyString } from './shortcutValues'

function normalizeRefs(value: unknown): ShortcutRef[] | undefined {
  if (!Array.isArray(value)) return undefined

  const refs = value
    .map((ref): ShortcutRef | undefined => {
      if (!isObjectRecord(ref)) return undefined

      const id = toInteger(ref.id)
      const entityType = toNonEmptyString(ref.entity_type)
      if (typeof id === 'undefined' && !entityType) return undefined

      const name = toNonEmptyString(ref.name)
      return {
        id,
        entity_type: entityType,
        ...(name ? { name } : {}),
      }
    })
    .filter((ref): ref is ShortcutRef => typeof ref !== 'undefined')

  return refs.length > 0 ? refs : undefined
}

/**
 * The entities an event refers to. A label created along with the change
 * (typed into a story's labels) arrives as an action of its own rather than
 * as a reference, so label actions count as references too.
 */
export function collectRefs(source: Record<string, unknown>): ShortcutRef[] | undefined {
  const actions = Array.isArray(source.actions) ? source.actions : []
  const labelActions = actions.filter((action) => isObjectRecord(action) && action.entity_type === 'label')
  const refs = [
    ...(normalizeRefs(source.refs) || normalizeRefs(source.references) || []),
    ...(normalizeRefs(labelActions) || []),
  ]
  return refs.length > 0 ? refs : undefined
}
