import type { TaskActivityEntry, TaskActivityKind } from './taskDiscussion'
import type { TaskTurnAction, TaskTurnOutcome } from './taskTurn'

/** The artifacts a task's conversation produces so far (ADR 0008). Code arrives with the pull request. */
export type TaskArtifactKind = 'research' | 'plan'

export interface TaskTimelinePerson {
  id: string
  name: string
}

/** One entry in a task's thread, oldest first (ADR 0008; build plan S1). */
export type TaskTimelineEntry =
  | {
      kind: 'message'
      id: string
      at: string
      author: TaskTimelinePerson | null
      body: string
      /** `session` when it was sent to the agent in a live session, which the agent reads. */
      channel: 'thread' | 'session'
      sessionId: string | null
    }
  | {
      kind: 'artifact_version'
      id: string
      at: string
      artifact: TaskArtifactKind
      version: number
      /** Null for the agent. */
      author: TaskTimelinePerson | null
      byAgent: boolean
    }
  | {
      kind: 'agent_turn'
      id: string
      at: string
      agent: { id: string; name: string }
      action: TaskTurnAction
      status: 'queued' | 'running' | 'blocked' | 'completed' | 'failed' | 'cancelled'
      /** Null until the turn finishes. */
      outcome: TaskTurnOutcome | null
      sessionId: string
      jobId: string | null
    }
  | { kind: 'event'; id: string; at: string; activity: TaskActivityEntry }

/**
 * Activity the thread shows another way: a posted message is the message
 * itself, and a hand edit is a new version of the document.
 */
export const ACTIVITY_SHOWN_ELSEWHERE_IN_THREAD: ReadonlySet<TaskActivityKind> = new Set(['message_posted', 'document_edited'])
