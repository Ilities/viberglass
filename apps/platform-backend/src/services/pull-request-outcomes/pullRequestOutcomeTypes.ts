export type PullRequestState = "open" | "closed" | "merged";

export interface PullRequestOutcome {
  state: PullRequestState;
  mergedAt: Date | null;
  closedAt: Date | null;
  commentCount: number;
  reviewCommentCount: number;
  /** The GitHub login of whoever merged it. */
  mergedBy?: string | null;
}

/** Told about each outcome the sweeper records, such as a merge that closes a task. */
export interface PullRequestOutcomeListener {
  onOutcome(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void>;
}

/** Reads the current outcome of a PR from the SCM that hosts it. */
export interface PullRequestOutcomeSource {
  supports(pullRequestUrl: string): boolean;
  fetchOutcome(pullRequestUrl: string, token: string): Promise<PullRequestOutcome>;
}
