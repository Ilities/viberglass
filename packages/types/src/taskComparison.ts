import type { TaskTurnAction } from './taskTurn'
import type { TicketLifecycleStatus } from './ticket'

/** How many runners one comparison can run side by side. */
export const TASK_COMPARISON_ARMS = { min: 2, max: 4 } as const

/** Starts a comparison: the same ask sent to each runner, each on a task forked from this one. */
export interface StartTaskComparisonRequest {
  agentIds: string[]
  message: string
  action?: TaskTurnAction
  /** The agent turn to fork from; the task as it is now when absent. */
  fromTurnId?: string
}

/** One runner's task in a comparison, with what its runs did so far. */
export interface TaskComparisonArm {
  ticketId: string
  key: string
  title: string
  status: TicketLifecycleStatus
  runner: { id: string; name: string }
  running: boolean
  runs: number
  lastRunStatus: 'queued' | 'active' | 'completed' | 'failed' | 'cancelled' | null
  /** What the latest turn set out to do, in the agent's words. */
  intent: string | null
  pullRequestUrl: string | null
  branch: string | null
  commit: string | null
  model: string | null
  /** Across the arm's runs; null when no run reported a cost. */
  costUsd: number | null
  durationMs: number | null
}

export interface TaskComparison {
  id: string
  parentTicketId: string
  forkedAt: string
  forkedFromTurnId: string | null
  baseBranch: string | null
  baseCommit: string | null
  winnerTicketId: string | null
  createdBy: { id: string; name: string } | null
  createdAt: string
  arms: TaskComparisonArm[]
}

/** A task's comparisons, and, when the task is an arm of one, where it came from. */
export interface TaskComparisonsView {
  comparisons: TaskComparison[]
  armOf: {
    comparisonId: string
    parent: { id: string; key: string; title: string }
    runner: { id: string; name: string }
    forkedAt: string
    winner: boolean
  } | null
}
