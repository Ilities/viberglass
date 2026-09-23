import type { JobListItem } from '@/service/api/job-api'
import type { AgentSession } from '@/service/api/session-api'

type WorkflowPhase = 'research' | 'planning' | 'execution'
type JobStatus = JobListItem['status']

const RUNNING_JOB_STATUSES: JobStatus[] = ['queued', 'active']

/**
 * Explains why a new run of this phase can't start yet, or returns null when
 * nothing is working on it. The backend refuses the same cases with a 409.
 */
export function describePhaseActivity(
  phase: WorkflowPhase,
  jobs: JobListItem[],
  activeSession: AgentSession | undefined,
  latestRunStatus?: JobStatus,
): string | null {
  if (activeSession) {
    return `A live ${phase} session is open. Continue it or end it before starting another.`
  }
  const hasRunningJob =
    jobs.some((job) => job.jobKind === phase && RUNNING_JOB_STATUSES.includes(job.status)) ||
    (latestRunStatus !== undefined && RUNNING_JOB_STATUSES.includes(latestRunStatus))
  if (hasRunningJob) {
    return `A ${phase} run is in progress. Wait for it to finish or cancel it before starting another.`
  }
  return null
}

export type PhasePosition = 'completed' | 'current' | 'upcoming'

export interface PhaseStatus {
  label: string
  color: 'green' | 'blue' | 'amber' | 'red' | 'zinc'
}

interface PhaseStatusInput {
  position: PhasePosition
  /** An agent is working on the phase right now (see describePhaseActivity). */
  isBusy: boolean
  latestRunStatus?: JobStatus
  /** A document or pull request exists for a human to review. */
  hasResult: boolean
  isResolved: boolean
}

/** The phase's status as a person would describe it; never "in progress" when nothing runs. */
export function derivePhaseStatus({
  position,
  isBusy,
  latestRunStatus,
  hasResult,
  isResolved,
}: PhaseStatusInput): PhaseStatus {
  if (position === 'completed') return { label: 'Complete', color: 'green' }
  if (position === 'upcoming') return { label: 'Upcoming', color: 'zinc' }
  if (isResolved) return { label: 'Complete', color: 'green' }
  if (isBusy) return { label: 'Agent working', color: 'blue' }
  if (latestRunStatus === 'failed') return { label: 'Failed', color: 'red' }
  if (hasResult) return { label: 'Awaiting review', color: 'amber' }
  if (latestRunStatus === 'cancelled') return { label: 'Cancelled', color: 'zinc' }
  return { label: 'Not started', color: 'zinc' }
}
