/**
 * Asking for changes on a build: what the reviewer wrote, and the open review
 * comments on the task's pull request that go to the agent with it.
 */
export type PullRequestReviewCommentKind = 'thread' | 'review' | 'conversation'

export interface PullRequestReviewComment {
  /** An unresolved inline thread, a review's summary, or a conversation comment. */
  kind: PullRequestReviewCommentKind
  author: string | null
  body: string
  /** File and line, for inline review threads. */
  path: string | null
  line: number | null
  url: string | null
  createdAt: string | null
}

export type BuildPullRequestState = 'open' | 'closed' | 'merged'

/** The pull request as GitHub has it now. */
export interface BuildPullRequestDetails {
  title: string | null
  state: BuildPullRequestState | null
  isDraft: boolean
  headBranch: string | null
  baseBranch: string | null
  additions: number | null
  deletions: number | null
  changedFiles: number | null
  commitCount: number | null
}

/** A task's pull request and what reviewers still want changed on it. */
export interface BuildPullRequest {
  pullRequestUrl: string | null
  /** Null when the pull request could not be read. */
  details: BuildPullRequestDetails | null
  /** Unresolved review threads, and review summaries and comments since the last build. */
  comments: PullRequestReviewComment[]
  /** Why the pull request could not be read, when it could not. */
  unavailableReason: string | null
}

export interface BuildChangeRequest {
  /** What the reviewer asked for, in their words. */
  message?: string
  /** Send the pull request's open review comments to the agent too. */
  includePullRequestComments?: boolean
}
