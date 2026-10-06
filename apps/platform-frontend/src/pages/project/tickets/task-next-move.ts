import type { JobListItem } from '@/service/api/job-api'
import type { AgentSession } from '@/service/api/session-api'
import { partRangeName, type JobFailure, type TaskPlanParts, type Ticket, type TicketWorkflowPhase } from '@viberglass/types'

export type TaskStep = TicketWorkflowPhase

/** Where a task's artifacts stand, from its runs: what the artifact bar and the failure notice show. */
export type TaskNextMove =
  | { kind: 'start'; step: TaskStep }
  | { kind: 'working'; step: TaskStep; runId: string | null; sessionId: string | null }
  /** A written document, waiting on people to read it and say what's next. */
  | { kind: 'ready'; step: 'planning' }
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
  plan: StepDocument
  /** The agent's session with a turn running, if any. */
  workingSession: Pick<AgentSession, 'id'> | undefined
}

const RUNNING = ['queued', 'active']

const isTaskStep = (kind: string): kind is TaskStep => kind === 'planning' || kind === 'execution'

export function decideTaskNextMove({ ticket, runs, plan, workingSession }: TaskNextMoveInput): TaskNextMove {
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

  if (plan.content.trim().length > 0) return { kind: 'ready', step }
  if (latest?.status === 'cancelled') return { kind: 'cancelled', step, runId: latest.jobId }
  return { kind: 'start', step }
}

export const TASK_STEPS: TaskStep[] = ['planning', 'execution']
export const STEP_NAME: Record<TaskStep, string> = { planning: 'Plan', execution: 'Code' }

export type StepPosition = 'done' | 'current' | 'upcoming'

/**
 * Where an artifact stands, in the words its tab shows under its name. Steps
 * are not a sequence: a task can go straight to code, so a plan counts as
 * written only when it exists.
 */
export function describeStep(
  step: TaskStep,
  currentStep: TaskStep,
  move: TaskNextMove,
  exists: boolean,
  /** For a plan in parts, how far its code has got, in place of "Pull request open". */
  codeProgress: string | null = null
): { position: StepPosition; label: string } {
  const progress = (label: string) => (step === 'execution' && codeProgress && label === 'Pull request open' ? codeProgress : label)
  if (step === currentStep) return { position: move.kind === 'done' ? 'done' : 'current', label: progress(CURRENT_LABEL[move.kind]) }
  if (exists) return { position: 'done', label: progress(step === 'execution' ? 'Pull request open' : 'Written') }
  return { position: 'upcoming', label: 'None yet' }
}

/** "PR open for part 2", "1 of 3 parts merged": how far the code of a plan in parts has got; null for a plan in one part. */
export function codeProgress(state: TaskPlanParts | null): string | null {
  if (!state || state.parts.length < 2) return null
  if (state.open) return `PR open for ${partRangeName(state.open)}`
  const merged = state.parts.filter((part) => part.status === 'merged').length
  return merged > 0 ? `${merged} of ${state.parts.length} parts merged` : null
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
