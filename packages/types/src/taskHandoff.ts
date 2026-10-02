import type { TaskPerson } from './taskSituation'

/** Someone working on a task's branch themselves while the agent is paused. */
export interface TaskTakeover {
  by: TaskPerson
  at: string
}

/** Where a task's code lives, for whoever takes the work over. */
export interface TaskCodeBranch {
  /** The task's branch: the one the agent's builds commit to. */
  branch: string
  repositoryUrl: string
  baseBranch: string
  /** Whether a build has pushed it yet; before that, taking over starts it from the base branch. */
  pushed: boolean
  takenOver: TaskTakeover | null
}
