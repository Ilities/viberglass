import type { JobStatus } from '@/service/api/job-api'
import type { TicketWorkflowPhase } from '@viberglass/types'

/** Whose move it is once a run has done what it can, and what that move is. */
export type RunNextStep =
  | { kind: 'queued' }
  | { kind: 'running' }
  | { kind: 'failed' }
  | { kind: 'cancelled'; canRunAgain: boolean }
  | { kind: 'superseded'; newerRunId: string }
  | { kind: 'session'; sessionId: string }
  /** The document is the task's latest, waiting on people to read it and say what's next. */
  | { kind: 'research_ready'; preview: string }
  | { kind: 'plan_ready'; preview: string }
  /** The task has a later artifact since this run's document. */
  | { kind: 'moved_on'; phase: 'research' | 'planning' }
  | { kind: 'pull_request'; url: string }
  | { kind: 'build_done' }
  | { kind: 'done' }

export interface RunNextStepInput {
  job: Pick<JobStatus, 'status' | 'jobKind' | 'agentSessionId' | 'result'>
  /** A later run of the same kind on this task, which this run's result was replaced by. */
  newerRunId: string | null
  /** Where the task is now; it may have moved on since this run. */
  taskPhase: TicketWorkflowPhase | null
  /** The task's document for this run's phase, for research and planning runs. */
  document: { content: string } | null
}

const PREVIEW_LINES = 8

export function documentPreview(content: string): string {
  return content.trim().split('\n').slice(0, PREVIEW_LINES).join('\n')
}

export function decideRunNextStep({ job, newerRunId, taskPhase, document }: RunNextStepInput): RunNextStep {
  if (job.status === 'queued') return { kind: 'queued' }
  if (job.status === 'active') return { kind: 'running' }
  if (newerRunId) return { kind: 'superseded', newerRunId }
  if (job.status === 'failed') return { kind: 'failed' }

  const isDocumentRun = job.jobKind === 'research' || job.jobKind === 'planning'
  if (job.status === 'cancelled') {
    return { kind: 'cancelled', canRunAgain: isDocumentRun && taskPhase === job.jobKind }
  }
  const content = document?.content.trim() ?? ''
  if (job.jobKind === 'research' && content) {
    return taskPhase === 'research'
      ? { kind: 'research_ready', preview: documentPreview(content) }
      : { kind: 'moved_on', phase: 'research' }
  }
  if (job.jobKind === 'planning' && content) {
    return taskPhase === 'planning'
      ? { kind: 'plan_ready', preview: documentPreview(content) }
      : { kind: 'moved_on', phase: 'planning' }
  }
  if (job.jobKind === 'execution') {
    return job.result?.pullRequestUrl ? { kind: 'pull_request', url: job.result.pullRequestUrl } : { kind: 'build_done' }
  }
  // A turn that only answered: the conversation carries on in the task's thread.
  if (job.agentSessionId) return { kind: 'session', sessionId: job.agentSessionId }
  return { kind: 'done' }
}
