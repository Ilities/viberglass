export type PullRequestState = "open" | "closed" | "merged";

export interface PullRequestOutcome {
  state: PullRequestState;
  mergedAt: Date | null;
  closedAt: Date | null;
  commentCount: number;
  reviewCommentCount: number;
}

/** Reads the current outcome of a PR from the SCM that hosts it. */
export interface PullRequestOutcomeSource {
  supports(pullRequestUrl: string): boolean;
  fetchOutcome(pullRequestUrl: string, token: string): Promise<PullRequestOutcome>;
}
