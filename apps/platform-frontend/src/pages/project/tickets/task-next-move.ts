import type { JobListItem } from '@/service/api/job-api'
import type { AgentSession } from '@/service/api/session-api'
import type { JobFailure, Ticket, TicketWorkflowPhase } from '@viberglass/types'

export type TaskStep = TicketWorkflowPhase

/** Where a task's artifacts stand, from its runs: what the artifact bar and the failure notice show. */
export type TaskNextMove =
  | { kind: 'start'; step: TaskStep }
  | { kind: 'working'; step: TaskStep; runId: string | null; sessionId: string | null }
  /** A written document, waiting on people to read it and say what's next. */
  | { kind: 'ready'; step: 'research' | 'planning' }
  | { kind: 'failed'; step: TaskStep; runId: string; failure: JobFailure | null }
  | { kind: 'cancelled'; step: TaskStep; runId: string }
  | { kind: 'pull_request'; url: string }
  | { kind: 'build_finished'; runId: string }
  | { kind: 'done' }

export interface StepDocument {
  content: string
}

export interface TaskNextMoveInput {
  ticket: Pick<Ticket, 'workflowPhase' | 'status' | 'pullRequestUrl'>
  /** The task's runs, newest first. */
  runs: Pick<JobListItem, 'jobId' | 'jobKind' | 'status' | 'failure'>[]
  documents: Partial<Record<'research' | 'planning', StepDocument>>
  /** The agent's session with a turn running, if any. */
  workingSession: Pick<AgentSession, 'id'> | undefined
}

const RUNNING = ['queued', 'active']

const isTaskStep = (kind: string): kind is TaskStep => kind === 'research' || kind === 'planning' || kind === 'execution'

export function decideTaskNextMove({ ticket, runs, documents, workingSession }: TaskNextMoveInput): TaskNextMove {
  if (ticket.status === 'resolved') return { kind: 'done' }

  const step = ticket.workflowPhase
  // Any turn running is the agent's move, whatever it was asked for.
  const running = runs.find((run) => RUNNING.includes(run.status))
  if (running) return { kind: 'working', step: isTaskStep(running.jobKind) ? running.jobKind : step, runId: running.jobId, sessionId: null }
  if (workingSession) return { kind: 'working', step, runId: null, sessionId: workingSession.id }

  const latest = runs.find((run) => run.jobKind === step)
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
  if (hasDocument) return { kind: 'ready', step }
  if (latest?.status === 'cancelled') return { kind: 'cancelled', step, runId: latest.jobId }
  return { kind: 'start', step }
}

export const TASK_STEPS: TaskStep[] = ['research', 'planning', 'execution']
export const STEP_NAME: Record<TaskStep, string> = { research: 'Research', planning: 'Plan', execution: 'Code' }

export type StepPosition = 'done' | 'current' | 'upcoming'

/** Where a step stands, in the words the stepper shows under its name. */
export function describeStep(step: TaskStep, currentStep: TaskStep, move: TaskNextMove): { position: StepPosition; label: string } {
  const index = TASK_STEPS.indexOf(step)
  const currentIndex = TASK_STEPS.indexOf(currentStep)
  if (index < currentIndex) return { position: 'done', label: 'Written' }
  if (index > currentIndex) return { position: 'upcoming', label: 'Not yet' }
  return { position: move.kind === 'done' ? 'done' : 'current', label: CURRENT_LABEL[move.kind] }
}

const CURRENT_LABEL: Record<TaskNextMove['kind'], string> = {
  start: 'Not started',
  working: 'Agent working',
  ready: 'Ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
  pull_request: 'Pull request open',
  build_finished: 'Finished',
  done: 'Done',
}
