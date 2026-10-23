import type { AgentTrackRecordEntry, AgentTrackRecordTask } from '@viberglass/types'

/** Below this many tasks an entry's rates say more about luck than about the agent. */
export const MIN_TASKS_TO_SAY = 5

export interface Ratio {
  count: number
  of: number
}

export interface TrackRecordSummary {
  tasks: number
  /** Of the tasks whose pull request was merged or closed; open ones aren't decided yet. */
  merged: Ratio
  /** Of the tasks built from a plan. */
  builtFromFirstPlan: Ratio
  questionsPerTask: number
  takenOver: Ratio
  /** Per pull request whose review was read; null when none was. */
  reviewComments: number | null
  /** Everything the entry's tasks cost, per merged pull request; null with no merge or no reported cost. */
  costPerMerge: number | null
  costEstimated: boolean
}

const average = (values: number[]): number | null => (values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null)

export function summarize(entry: AgentTrackRecordEntry): TrackRecordSummary {
  const tasks = entry.tasks
  const count = (test: (task: AgentTrackRecordTask) => boolean) => tasks.filter(test).length
  const merged = count((task) => task.pullRequest === 'merged')
  const costs = tasks.flatMap((task) => (task.costUsd === null ? [] : [task.costUsd]))
  return {
    tasks: tasks.length,
    merged: { count: merged, of: count((task) => task.pullRequest === 'merged' || task.pullRequest === 'closed') },
    builtFromFirstPlan: { count: count((task) => task.built && task.planRounds === 1), of: count((task) => task.built && task.planRounds > 0) },
    questionsPerTask: tasks.length ? tasks.reduce((sum, task) => sum + task.questions, 0) / tasks.length : 0,
    takenOver: { count: count((task) => task.takenOver), of: tasks.length },
    reviewComments: average(tasks.flatMap((task) => (task.reviewComments === null ? [] : [task.reviewComments]))),
    costPerMerge: merged > 0 && costs.length > 0 ? costs.reduce((sum, cost) => sum + cost, 0) / merged : null,
    costEstimated: tasks.some((task) => task.costEstimated),
  }
}

function planFact({ built, planRounds }: AgentTrackRecordTask): string | null {
  if (planRounds === 0) return null
  if (!built) return `${planRounds} ${planRounds === 1 ? 'plan' : 'plans'}, not built`
  return planRounds === 1 ? 'built from the first plan' : `built after ${planRounds} plans`
}

/** How one task went, in a few words. */
export function taskFacts(task: AgentTrackRecordTask): string[] {
  const pullRequest = { merged: 'Merged', open: 'Pull request open', closed: 'Closed unmerged' } as const
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  return [
    task.pullRequest ? pullRequest[task.pullRequest] : 'No pull request',
    planFact(task),
    task.questions > 0 ? plural(task.questions, 'question') : null,
    task.takenOver ? 'engineer took over' : null,
    task.failedRuns > 0 ? plural(task.failedRuns, 'failed run') : null,
    task.reviewComments ? plural(task.reviewComments, 'review comment') : null,
  ].filter((fact): fact is string => Boolean(fact))
}
