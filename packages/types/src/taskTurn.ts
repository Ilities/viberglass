/**
 * What a person asks the agent for in a turn. `reply` leaves it to
 * the agent: it answers, and rewrites the research or plan if that's what was asked.
 */
export const TASK_TURN_ACTIONS = ['research', 'plan', 'code', 'reply', 'summarise'] as const

export type TaskTurnAction = (typeof TASK_TURN_ACTIONS)[number]

export function isTaskTurnAction(value: unknown): value is TaskTurnAction {
  return TASK_TURN_ACTIONS.some((action) => action === value)
}

/** The artifacts a turn can produce. */
export type TaskTurnProduct = 'research' | 'plan' | 'code' | 'summary'

/** What a finished turn did, as the thread shows it. */
export interface TaskTurnOutcome {
  /** The agent's first line: what it said it was about to do. */
  intent: string | null
  /** Everything the agent said in the turn. */
  reply: string
  produced: TaskTurnProduct[]
  /** The agent changed code in a turn that wasn't allowed to, so the changes were thrown away. */
  codeDiscarded: boolean
  /** Whether the turn continued the agent's earlier session; null when the worker didn't say. */
  resumed: boolean | null
  /** Whom the agent asked to look at what it produced; absent on older turns. */
  mentioned?: Array<{ id: string; name: string }>
  /** How full the harness's context was at the end of the turn, when it said. */
  contextUsage?: { used: number; size: number | null } | null
  /** Whether the harness compacted its context after the turn, with our instructions. */
  compacted?: boolean
  /** The commit a build pushed to the task's branch. */
  commit?: string | null
  /** The turn was stopped before it finished; `produced` is what it had done by then. */
  stoppedPartway?: boolean
}
