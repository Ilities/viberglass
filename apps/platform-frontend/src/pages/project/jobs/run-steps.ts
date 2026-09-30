import type { JobStatus, ProgressUpdate } from '@/service/api/job-api'

export type RunStepKey = 'prepare' | 'work' | 'finish'
/** `not_reached`: the run ended (failed or cancelled) before this step. */
export type RunStepState = 'done' | 'current' | 'upcoming' | 'failed' | 'stopped' | 'not_reached'

export interface RunStep {
  key: RunStepKey
  title: string
  state: RunStepState
  startedAt: string | null
}

const STEP_ORDER: RunStepKey[] = ['prepare', 'work', 'finish']

// The worker's progress stages, grouped into the three steps a person follows.
const STEP_OF_STAGE: Record<string, RunStepKey> = {
  initialize: 'prepare',
  'restore-state': 'prepare',
  clone: 'prepare',
  instructions: 'prepare',
  branch: 'prepare',
  execute: 'work',
  commit: 'finish',
  push: 'finish',
  pr: 'finish',
  complete: 'finish',
}

const STEP_TITLE: Record<RunStepKey, string> = {
  prepare: 'Preparing',
  work: 'Agent working',
  finish: 'Finishing',
}

type RunStepsInput = Pick<JobStatus, 'status' | 'progressUpdates'>

function oldestFirst(updates: ProgressUpdate[]): ProgressUpdate[] {
  return [...updates].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
}

/** The run's three steps and where it got to, from its progress updates. */
export function buildRunSteps(job: RunStepsInput): RunStep[] {
  const startedAt = new Map<RunStepKey, string>()
  for (const update of oldestFirst(job.progressUpdates)) {
    const step = update.step ? STEP_OF_STAGE[update.step] : undefined
    if (step && !startedAt.has(step)) startedAt.set(step, update.createdAt)
  }
  const furthest = STEP_ORDER.reduce((reached, step, index) => (startedAt.has(step) ? index : reached), -1)

  return STEP_ORDER.map((key, index) => ({
    key,
    title: STEP_TITLE[key],
    startedAt: startedAt.get(key) ?? null,
    state: stepState(job.status, index, furthest),
  }))
}

function stepState(status: JobStatus['status'], index: number, furthest: number): RunStepState {
  switch (status) {
    case 'completed':
      return 'done'
    case 'queued':
      return 'upcoming'
    case 'active':
      if (index < furthest) return 'done'
      return index === Math.max(furthest, 0) ? 'current' : 'upcoming'
    case 'failed':
    case 'cancelled': {
      // A run that ended before reporting any step ended while preparing.
      const endedAt = Math.max(furthest, 0)
      if (index < endedAt) return 'done'
      if (index === endedAt) return status === 'failed' ? 'failed' : 'stopped'
      return 'not_reached'
    }
  }
}
