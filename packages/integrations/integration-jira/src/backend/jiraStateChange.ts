import { field, recordAt, stringAt } from '@viberglass/integration-core'
import type { InboundIssueStateChange } from '@viberglass/types'

function changelogItem(payload: unknown, fieldName: string): unknown {
  const items = field(recordAt(payload, 'changelog'), 'items')
  if (!Array.isArray(items)) return undefined
  return items.find((item) => (stringAt(item, 'fieldId') ?? stringAt(item, 'field'))?.toLowerCase() === fieldName)
}

const isSet = (item: unknown, side: 'from' | 'to'): boolean => Boolean(stringAt(item, side) ?? stringAt(item, `${side}String`))

/**
 * Whether an update resolved the issue or took its resolution back. A move into
 * a status in the done category closes it too, for workflows without
 * resolutions. Only a cleared resolution reopens it: the changelog doesn't say
 * which category the old status was in, and moving between open statuses
 * mustn't reopen a task that's done.
 */
export function jiraStateChange(payload: unknown): InboundIssueStateChange | undefined {
  const resolution = changelogItem(payload, 'resolution')
  if (resolution) {
    const before = isSet(resolution, 'from')
    const after = isSet(resolution, 'to')
    if (after && !before) return 'closed'
    if (before && !after) return 'reopened'
  }
  if (!changelogItem(payload, 'status')) return undefined
  const category = stringAt(recordAt(recordAt(recordAt(recordAt(payload, 'issue'), 'fields'), 'status'), 'statusCategory'), 'key')
  return category === 'done' ? 'closed' : undefined
}
