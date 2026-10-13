import { field, idAt, recordAt, stringAt } from '@viberglass/integration-core'
import type { InboundIssueStateChange } from '@viberglass/types'

function newValue(changes: unknown, key: string): unknown {
  return field(recordAt(changes, key), 'new')
}

function workflowStateType(payload: unknown, id: unknown): string | undefined {
  const refs = field(payload, 'refs')
  if (!Array.isArray(refs) || id === undefined) return undefined
  const ref = refs.find((candidate) => stringAt(candidate, 'entity_type') === 'workflow-state' && idAt(candidate, 'id') === String(id))
  return stringAt(ref, 'type')
}

/** A move between workflow states closes or reopens the story when it crosses into or out of a done state. */
function workflowChange(payload: unknown, changes: unknown): InboundIssueStateChange | undefined {
  const change = recordAt(changes, 'workflow_state_id')
  if (!change) return undefined
  const before = workflowStateType(payload, field(change, 'old'))
  const after = workflowStateType(payload, field(change, 'new'))
  if (after === 'done' && before !== 'done') return 'closed'
  if (before === 'done' && after && after !== 'done') return 'reopened'
  return undefined
}

/**
 * Whether a story update completed or archived the story, or took that back.
 * Unarchiving a story that's still completed doesn't reopen it.
 */
export function shortcutStateChange(payload: unknown): InboundIssueStateChange | undefined {
  const changes = recordAt(payload, 'changes')
  if (!changes) return undefined
  const completed = newValue(changes, 'completed')
  if (completed === true) return 'closed'
  if (completed === false) return 'reopened'
  const archived = newValue(changes, 'archived')
  if (archived === true) return 'closed'
  if (archived === false && field(recordAt(payload, 'data'), 'completed') !== true) return 'reopened'
  return workflowChange(payload, changes)
}
