import type { JobKind } from '@viberglass/types'
import { STEP_NAME, TASK_STEPS, type TaskStep } from './task-next-move'

function stepOf(kind: JobKind): TaskStep | null {
  return TASK_STEPS.find((step) => step === kind) ?? null
}

/**
 * The runs a step lists: those asked for that step, and on the task's current
 * step every run that isn't a step of its own, such as a reply in the thread,
 * which works on whatever the task is at.
 */
export function runsForStep<R extends { jobKind: JobKind }>(runs: R[], step: TaskStep, currentStep: TaskStep): R[] {
  return runs.filter((run) => {
    const own = stepOf(run.jobKind)
    return own ? own === step : step === currentStep && run.jobKind !== 'agent_login'
  })
}

/** The step a run is listed under, for a link that opens it. */
export function stepForRun(kind: JobKind, currentStep: TaskStep): TaskStep {
  return stepOf(kind) ?? currentStep
}

/** "Code run", "Reply run", "Scheduled run": what a run was, for its line. */
export function runName(kind: JobKind): string {
  const step = stepOf(kind)
  if (step) return `${STEP_NAME[step]} run`
  if (kind === 'reply') return 'Reply run'
  if (kind === 'claw') return 'Scheduled run'
  return 'Run'
}
