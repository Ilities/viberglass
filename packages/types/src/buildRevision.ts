/**
 * A task's pull request and its open review comments, which go to the agent
 * when it's asked to build on it.
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
  /** The commit the branch points at now. */
  headSha: string | null
  baseBranch: string | null
  additions: number | null
  deletions: number | null
  changedFiles: number | null
  commitCount: number | null
  /** Where the change can be seen running, when the repository's deployments or preview checks report one. */
  previewUrl: string | null
}

/** A task's pull request and what reviewers still want changed on it. */
export interface BuildPullRequest {
  pullRequestUrl: string | null
  /** Null when the pull request could not be read. */
  details: BuildPullRequestDetails | null
  /** Unresolved review threads, and review summaries and comments since the last build. */
  comments: PullRequestReviewComment[]
  /** Why the pull request could not be read, when it could not and the reader may act on it. */
  unavailableReason: string | null
  /** What Viberglass last recorded about it, for when it could not be read. */
  recorded: RecordedPullRequest | null
}

/** A pull request as Viberglass last saw it on its code host. */
export interface RecordedPullRequest {
  state: BuildPullRequestState | null
  mergedAt: string | null
  closedAt: string | null
  /** Who merged it, as the merge was recorded on the task. */
  mergedBy: string | null
  commentCount: number | null
  reviewCommentCount: number | null
  checkedAt: string
}

/** One of a task's pull requests: the parts of the plan it builds, on its own branch. */
export interface TaskPullRequest extends BuildPullRequest {
  pullRequestUrl: string
  branch: string
  firstPart: number
  /** Null: through the plan's last part. */
  lastPart: number | null
}
