import type { BuildPullRequestDetails, PullRequestReviewComment } from './buildRevision'

export type PullRequestState = 'open' | 'closed' | 'merged'

/** Where a pull request stands, as its code host reports it. */
export interface PullRequestOutcome {
  state: PullRequestState
  mergedAt: Date | null
  closedAt: Date | null
  commentCount: number
  reviewCommentCount: number
  /** The code host's name for whoever merged it. */
  mergedBy?: string | null
}

/** A pull request and what reviewers still want changed on it. */
export interface PullRequestReview {
  details: BuildPullRequestDetails
  comments: PullRequestReviewComment[]
}
