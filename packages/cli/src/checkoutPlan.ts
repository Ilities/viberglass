import type { TaskCodeBranch } from '@viberglass/types'

/** One git command, as its arguments. */
export type GitCommand = string[]

/**
 * The git commands that put a task's branch in the current clone: fetch it
 * and switch to it when a build has pushed it, else start it from the base
 * branch, so what you push is where the agent looks when you hand back.
 */
export function checkoutPlan(branch: TaskCodeBranch): GitCommand[] {
  if (branch.pushed) {
    return [
      ['fetch', 'origin', branch.branch],
      ['switch', '--track', '-C', branch.branch, `origin/${branch.branch}`],
    ]
  }
  return [
    ['fetch', 'origin', branch.baseBranch],
    ['switch', '-c', branch.branch, `origin/${branch.baseBranch}`],
  ]
}

/** Whether the clone's origin is the task's repository, give or take `.git` and the protocol. */
export function sameRepository(originUrl: string, repositoryUrl: string): boolean {
  const normalise = (url: string) =>
    url
      .trim()
      .replace(/\.git$/, '')
      .replace(/^git@([^:]+):/, '$1/')
      .replace(/^[a-z+]+:\/\/(?:[^@/]+@)?/, '')
      .toLowerCase()
  return normalise(originUrl) === normalise(repositoryUrl)
}
