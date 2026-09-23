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
