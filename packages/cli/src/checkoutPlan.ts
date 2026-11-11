import type { TaskCodeBranch } from '@viberglass/types'

/** One git command, as its arguments. */
export type GitCommand = string[]

/**
 * The git commands that put a task's branch in the current clone: fetch it
 * and switch to it when a build has pushed it, else start it from the base
 * branch. Either way the branch's upstream is origin's branch of the same
 * name, so a plain `git push` goes where the agent looks when you hand back,
 * never to the base branch.
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
    ['switch', '--no-track', '-c', branch.branch, `origin/${branch.baseBranch}`],
    // origin has no such branch yet, so `git branch --set-upstream-to` would refuse it.
    ['config', `branch.${branch.branch}.remote`, 'origin'],
    ['config', `branch.${branch.branch}.merge`, `refs/heads/${branch.branch}`],
  ]
}

/** What to do once the branch is checked out: who has the work, and how to push to the task's branch. */
export function handBackNote(branch: TaskCodeBranch): string {
  const holder = branch.takenOver
    ? `${branch.takenOver.by.name} has the work.`
    : 'Nobody has taken the work over yet; take it over in Viberglass first.'
  const start = branch.pushed
    ? `On ${branch.branch}, tracking origin/${branch.branch}.`
    : `On ${branch.branch}, started from origin/${branch.baseBranch}. Nothing is pushed to it yet; your first push creates origin/${branch.branch}.`
  return `${start} ${holder}\nCommit, push with \`git push -u origin ${branch.branch}\`, then hand back in Viberglass.`
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
