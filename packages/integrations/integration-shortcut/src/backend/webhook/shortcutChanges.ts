import { isObjectRecord } from '@viberglass/types'
import { getNestedRecord, toNonEmptyString } from './shortcutValues'

export function normalizeChangedFields(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined

  const fields = value
    .map((field) => toNonEmptyString(field))
    .filter((field): field is string => Boolean(field))

  return fields.length > 0 ? fields : undefined
}

const NEW_VALUE_KEYS = ['new', 'after', 'to', 'value']

function extractChangedFieldValue(value: unknown): unknown {
  if (!isObjectRecord(value)) return value
  const key = NEW_VALUE_KEYS.find((candidate) => Object.prototype.hasOwnProperty.call(value, candidate))
  return key ? value[key] : value
}

/** The story or comment with an update's changes applied, since a v1 update carries the old values beside them. */
export function applyChangedFields(
  data: Record<string, unknown> | undefined,
  source: Record<string, unknown>,
  actionRecord: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  const changes = getNestedRecord(actionRecord, 'changes') || getNestedRecord(source, 'changes')
  if (!changes) return data

  const changedFieldNames = new Set<string>([
    ...Object.keys(changes),
    ...(normalizeChangedFields(source.changed_fields) || []),
    ...(normalizeChangedFields(source.changedFields) || []),
    ...(normalizeChangedFields(actionRecord?.changed_fields) || []),
    ...(normalizeChangedFields(actionRecord?.changedFields) || []),
  ])

  if (changedFieldNames.size === 0) return data

  const mergedData: Record<string, unknown> = { ...(data || {}) }
  for (const field of changedFieldNames) {
    const candidateValue = extractChangedFieldValue(changes[field])
    if (typeof candidateValue !== 'undefined') mergedData[field] = candidateValue
  }

  return mergedData
}
