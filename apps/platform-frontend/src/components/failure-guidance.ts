import { JOB_FAILURE_CODE, type JobFailure } from '@viberglass/types'

export interface FailureGuidance {
  /** What happened, in a few words. */
  title: string
  /** What happened, as a sentence anyone can read. */
  summary: string
  /** The first line of the agent's own error, when Viberglass couldn't name the failure. */
  reported?: string
  /** What this person can do next. */
  nextStep: string
  /** A link to where the problem is fixed, for people allowed to fix it. */
  fix?: { label: string; href: string }
  /** Whether trying again from the task is worth it. */
  canRetry: boolean
}

/** The runner the failed run used, so a fix can go straight to it. */
export interface FailedRunner {
  name: string
  slug: string
}

function setupFixFor(code: string, project: string, runner?: FailedRunner): { label: string; href: string } {
  switch (code) {
    case JOB_FAILURE_CODE.AGENT_CREDENTIAL_INVALID:
    case JOB_FAILURE_CODE.AGENT_QUOTA_EXHAUSTED:
      return runner
        ? { label: `Check ${runner.name}'s model key`, href: `/settings/agents/${runner.slug}` }
        : { label: 'Check the model key', href: '/settings/secrets' }
    case JOB_FAILURE_CODE.AGENT_CONTEXT_EXCEEDED:
      return runner
        ? { label: `Check ${runner.name}'s model`, href: `/settings/agents/${runner.slug}` }
        : { label: 'Check agent runners', href: '/settings/agents' }
    case JOB_FAILURE_CODE.RUNNER_UNAVAILABLE:
      return runner ? { label: `Check ${runner.name}`, href: `/settings/agents/${runner.slug}` } : { label: 'Check agent runners', href: '/settings/agents' }
    default:
      return { label: 'Fix repository settings', href: `/spaces/${project}/settings/repository` }
  }
}

const REPORTED_MAX_LENGTH = 200

/**
 * A generic agent failure says nothing about the cause, so the agent's own
 * error leads instead of hiding in the technical details.
 */
function reportedError(failure: JobFailure | null | undefined): string | undefined {
  if (failure?.code !== JOB_FAILURE_CODE.AGENT_FAILED) return undefined
  const line = failure.technicalDetail
    ?.split('\n')
    .map((text) => text.trim())
    .find(Boolean)
  if (!line) return undefined
  return line.length > REPORTED_MAX_LENGTH ? `${line.slice(0, REPORTED_MAX_LENGTH - 1)}…` : line
}

/** What happened, in a few words and in a sentence anyone can read, before any technical detail. */
export function failureHeadline(failure: JobFailure | null | undefined): { title: string; summary: string; reported?: string } {
  const reported = reportedError(failure)
  return {
    title: failure?.title ?? 'Run failed',
    summary: failure?.summary ?? 'The run stopped before it could finish.',
    ...(reported ? { reported } : {}),
  }
}

/**
 * Failure copy by audience: setup problems send admins to the fix and tell
 * everyone else an admin is needed; agent problems invite a retry; problems
 * in Viberglass itself say so instead of blaming the person's setup.
 */
export function failureGuidance(failure: JobFailure | undefined, isAdmin: boolean, project: string, runner?: FailedRunner): FailureGuidance {
  const { title, summary, reported } = failureHeadline(failure)

  switch (failure?.category) {
    case 'setup':
      return isAdmin
        ? {
            title,
            summary,
            reported,
            nextStep: 'Trying again with the same setup will fail the same way. Fix the setup, then try again from the task.',
            fix: setupFixFor(failure.code, project, runner),
            canRetry: false,
          }
        : {
            title,
            summary,
            reported,
            nextStep: `A workspace admin needs to fix ${runner ? `${runner.name}'s setup` : 'the setup'} before the agent can run again; trying again before that fails the same way. Let them know.`,
            canRetry: false,
          }
    case 'agent':
      return {
        title,
        summary,
        reported,
        nextStep: 'Try again from the task. Adding detail to the task description often helps.',
        canRetry: true,
      }
    case 'platform':
      return {
        title,
        summary,
        reported,
        nextStep: 'Try again. If it keeps happening, share the technical details with your admin.',
        canRetry: true,
      }
    default:
      // Failures recorded before categories existed.
      return { title, summary, reported, nextStep: 'Check the technical details, then try again from the task.', canRetry: true }
  }
}
