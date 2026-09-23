export const JOB_KIND = {
  RESEARCH: 'research',
  PLANNING: 'planning',
  EXECUTION: 'execution',
  CLAW: 'claw',
} as const

export type JobKind = (typeof JOB_KIND)[keyof typeof JOB_KIND]

export type JobStatus = 'queued' | 'active' | 'completed' | 'failed' | 'cancelled'

/**
 * Why a run failed, decided where the failure happened (the worker stage or
 * the platform), never by reading error text afterwards.
 */
export const JOB_FAILURE_CODE = {
  /** The worker could not clone the repository: wrong URL, or the credential can't read it. */
  REPOSITORY_ACCESS_FAILED: 'REPOSITORY_ACCESS_FAILED',
  /** The branch could not be pushed or the pull request opened: the credential can't write. */
  REPOSITORY_WRITE_FAILED: 'REPOSITORY_WRITE_FAILED',
  /** The model provider rejected the agent's API key or login. */
  AGENT_CREDENTIAL_INVALID: 'AGENT_CREDENTIAL_INVALID',
  /** The model provider refused for quota, credit or rate limits. */
  AGENT_QUOTA_EXHAUSTED: 'AGENT_QUOTA_EXHAUSTED',
  /** The agent itself failed or gave up. */
  AGENT_FAILED: 'AGENT_FAILED',
  /** The agent finished without writing the research or plan document. */
  AGENT_NO_DOCUMENT: 'AGENT_NO_DOCUMENT',
  /** The agent finished execution without changing any code. */
  AGENT_NO_CHANGES: 'AGENT_NO_CHANGES',
  /** No worker could be started for the run. */
  RUNNER_UNAVAILABLE: 'RUNNER_UNAVAILABLE',
  /** The worker stopped reporting and was given up on. */
  RUN_LOST: 'RUN_LOST',
  /** Anything not classified above; most likely a Viberglass bug. */
  RUN_FAILED: 'RUN_FAILED',
} as const

export type JobFailureCode = (typeof JOB_FAILURE_CODE)[keyof typeof JOB_FAILURE_CODE]

/** Who can act on a failure: an admin fixing setup, anyone retrying the agent, or Viberglass itself. */
export type JobFailureCategory = 'setup' | 'agent' | 'platform'

export interface JobFailure {
  code: string
  /** A few words, for badges and lists. Missing on failures recorded before categories existed. */
  title?: string
  /** One plain sentence anyone can read. */
  summary: string
  category?: JobFailureCategory
  technicalDetail?: string
  retryable: boolean
}
