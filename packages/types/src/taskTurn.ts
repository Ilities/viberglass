/**
 * What a person asks the agent for in a turn (ADR 0008). `reply` leaves it to
 * the agent: it answers, and rewrites the research or plan if that's what was asked.
 */
export const TASK_TURN_ACTIONS = ['research', 'plan', 'code', 'reply', 'summarise'] as const

export type TaskTurnAction = (typeof TASK_TURN_ACTIONS)[number]

export function isTaskTurnAction(value: unknown): value is TaskTurnAction {
  return TASK_TURN_ACTIONS.some((action) => action === value)
}

/** The artifacts a turn can produce. */
export type TaskTurnProduct = 'research' | 'plan' | 'code'

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
}
