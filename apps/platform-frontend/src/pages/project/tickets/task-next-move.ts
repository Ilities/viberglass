import type { JobListItem } from '@/service/api/job-api'
import type { AgentSession } from '@/service/api/session-api'
import type { ApprovalState } from '@/service/api/ticket-api'
import type { JobFailure, Ticket, TicketWorkflowPhase } from '@viberglass/types'

export type TaskStep = TicketWorkflowPhase

/** What happens next on a task, and whose move it is. One per task, shown at the top of its page. */
export type TaskNextMove =
  | { kind: 'start'; step: TaskStep }
  | { kind: 'working'; step: TaskStep; runId: string | null; sessionId: string | null }
  | { kind: 'reply_in_session'; step: TaskStep; sessionId: string }
  | { kind: 'review'; step: 'research' | 'planning' }
  | { kind: 'failed'; step: TaskStep; runId: string; failure: JobFailure | null }
  | { kind: 'cancelled'; step: TaskStep; runId: string }
  | { kind: 'pull_request'; url: string }
  | { kind: 'build_finished'; runId: string }
  | { kind: 'done' }

export interface StepDocument {
  content: string
  approvalState: ApprovalState
}

export interface TaskNextMoveInput {
  ticket: Pick<Ticket, 'workflowPhase' | 'status' | 'pullRequestUrl'>
  /** The task's runs, newest first. */
  runs: Pick<JobListItem, 'jobId' | 'jobKind' | 'status' | 'failure'>[]
  documents: Partial<Record<'research' | 'planning', StepDocument>>
  /** An open live session for the current step, if any. */
  activeSession: Pick<AgentSession, 'id' | 'status'> | undefined
}

const RUNNING = ['queued', 'active']

export function decideTaskNextMove({ ticket, runs, documents, activeSession }: TaskNextMoveInput): TaskNextMove {
  if (ticket.status === 'resolved') return { kind: 'done' }

  const step = ticket.workflowPhase
  if (activeSession) {
    return activeSession.status === 'waiting_on_user'
      ? { kind: 'reply_in_session', step, sessionId: activeSession.id }
      : { kind: 'working', step, runId: null, sessionId: activeSession.id }
  }

  const latest = runs.find((run) => run.jobKind === step)
  if (latest && RUNNING.includes(latest.status)) return { kind: 'working', step, runId: latest.jobId, sessionId: null }
  // A failed run is news even when an earlier run left a document behind.
  if (latest?.status === 'failed') return { kind: 'failed', step, runId: latest.jobId, failure: latest.failure ?? null }

  if (step === 'execution') {
    if (ticket.pullRequestUrl) return { kind: 'pull_request', url: ticket.pullRequestUrl }
    if (latest?.status === 'completed') return { kind: 'build_finished', runId: latest.jobId }
    if (latest?.status === 'cancelled') return { kind: 'cancelled', step, runId: latest.jobId }
    return { kind: 'start', step }
  }

  const document = documents[step]
  const hasDocument = (document?.content.trim().length ?? 0) > 0
  if (hasDocument && document?.approvalState !== 'approved') return { kind: 'review', step }
  if (latest?.status === 'cancelled') return { kind: 'cancelled', step, runId: latest.jobId }
  return { kind: 'start', step }
}

export const TASK_STEPS: TaskStep[] = ['research', 'planning', 'execution']
export const STEP_NAME: Record<TaskStep, string> = { research: 'Research', planning: 'Plan', execution: 'Build' }

export type StepPosition = 'done' | 'current' | 'upcoming'

/** Where a step stands, in the words the stepper shows under its name. */
export function describeStep(step: TaskStep, currentStep: TaskStep, move: TaskNextMove): { position: StepPosition; label: string } {
  const index = TASK_STEPS.indexOf(step)
  const currentIndex = TASK_STEPS.indexOf(currentStep)
  if (index < currentIndex) return { position: 'done', label: 'Approved' }
  if (index > currentIndex) return { position: 'upcoming', label: 'Not yet' }
  return { position: move.kind === 'done' ? 'done' : 'current', label: CURRENT_LABEL[move.kind] }
}

const CURRENT_LABEL: Record<TaskNextMove['kind'], string> = {
  start: 'Not started',
  working: 'Agent working',
  reply_in_session: 'Waiting on you',
  review: 'Awaiting review',
  failed: 'Failed',
  cancelled: 'Cancelled',
  pull_request: 'Pull request open',
  build_finished: 'Finished',
  done: 'Done',
}
