import type { TaskTimelineEntry } from '@viberglass/types'

type AgentTurn = Extract<TaskTimelineEntry, { kind: 'agent_turn' }>

/** A thread entry shown as it is, or a run of attempts that didn't finish, folded into one row. */
export type ThreadRow =
  | { kind: 'entry'; entry: TaskTimelineEntry }
  | { kind: 'attempts'; id: string; entries: TaskTimelineEntry[]; turns: AgentTurn[] }

/** The words the Try again button posts; anything else someone wrote is a message of its own. */
const RETRY_REQUEST = /^Try again(?: with .+)?$/

function isUnfinished(entry: TaskTimelineEntry): entry is AgentTurn {
  return entry.kind === 'agent_turn' && (entry.status === 'failed' || entry.status === 'cancelled')
}

function isRunEnding(entry: TaskTimelineEntry): boolean {
  return entry.kind === 'event' && (entry.activity.kind === 'run_failed' || entry.activity.kind === 'run_cancelled')
}

function isRetryRequest(entry: TaskTimelineEntry): boolean {
  return entry.kind === 'message' && RETRY_REQUEST.test(entry.body.trim())
}

/**
 * Folds two or more failed or stopped turns in a row, with the retry requests
 * and run-ended lines between them, into one row. `keepId` is a turn that
 * stays out of any fold, such as the latest failed one, which offers to try again.
 */
export function foldAttempts(entries: TaskTimelineEntry[], keepId: string | null = null): ThreadRow[] {
  const rows: ThreadRow[] = []
  const foldable = (entry: TaskTimelineEntry) => isUnfinished(entry) && entry.id !== keepId
  let index = 0
  while (index < entries.length) {
    const first = entries[index]
    if (!foldable(first)) {
      rows.push({ kind: 'entry', entry: first })
      index += 1
      continue
    }
    let end = index
    for (let next = index + 1; next < entries.length; next++) {
      const entry = entries[next]
      if (foldable(entry)) end = next
      else if (!isRetryRequest(entry) && !isRunEnding(entry)) break
    }
    // A retry request after the last folded turn asked for the turn that follows, so it stays with it.
    while (end + 1 < entries.length && isRunEnding(entries[end + 1])) end += 1
    const group = entries.slice(index, end + 1)
    const turns = group.filter(isUnfinished)
    if (turns.length >= 2) rows.push({ kind: 'attempts', id: `attempts:${first.id}`, entries: group, turns })
    else rows.push(...group.map((entry): ThreadRow => ({ kind: 'entry', entry })))
    index = end + 1
  }
  return rows
}

/** "3 failed attempts", "2 stopped attempts", "3 failed or stopped attempts". */
export function attemptsLabel(turns: AgentTurn[]): string {
  const failed = turns.filter((turn) => turn.status === 'failed').length
  const how = failed === turns.length ? 'failed' : failed === 0 ? 'stopped' : 'failed or stopped'
  return `${turns.length} ${how} attempts`
}
