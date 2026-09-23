import { JOB_FAILURE_CODE, type JobFailure } from '@viberglass/types'

export interface FailureGuidance {
  /** What happened, in a few words. */
  title: string
  /** What happened, as a sentence anyone can read. */
  summary: string
  /** What this person can do next. */
  nextStep: string
  /** A link to where the problem is fixed, for people allowed to fix it. */
  fix?: { label: string; href: string }
  /** Whether trying again from the task is worth it. */
  canRetry: boolean
}

function setupFixFor(code: string, project: string): { label: string; href: string } {
  switch (code) {
    case JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID:
    case JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED:
      return { label: 'Check the model key', href: '/secrets' }
    case JOB_FAILURE_CODE.RUNNER_UNAVAILABLE:
      return { label: 'Check agent runners', href: '/clankers' }
    default:
      return { label: 'Fix repository settings', href: `/project/${project}/settings` }
  }
}

/**
 * Failure copy by audience: setup problems send admins to the fix and tell
 * everyone else an admin is needed; agent problems invite a retry; problems
 * in Viberglass itself say so instead of blaming the person's setup.
 */
export function failureGuidance(failure: JobFailure | undefined, isAdmin: boolean, project: string): FailureGuidance {
  const title = failure?.title ?? 'Run failed'
  const summary = failure?.summary ?? 'The run stopped before it could finish.'

  switch (failure?.category) {
    case 'setup':
      return isAdmin
        ? {
            title,
            summary,
            nextStep: 'Fix the setup, then try again from the task.',
            fix: setupFixFor(failure.code, project),
            canRetry: false,
          }
        : {
            title,
            summary,
            nextStep: 'A workspace admin needs to fix this before the agent can run again. Let them know.',
            canRetry: false,
          }
    case 'agent':
      return {
        title,
        summary,
        nextStep: 'Try again from the task. Adding detail to the task description often helps.',
        canRetry: true,
      }
    case 'platform':
      return {
        title,
        summary,
        nextStep: 'Try again. If it keeps happening, share the technical details with your admin.',
        canRetry: true,
      }
    default:
      // Failures recorded before categories existed.
      return { title, summary, nextStep: 'Check the technical details, then try again from the task.', canRetry: true }
  }
}
