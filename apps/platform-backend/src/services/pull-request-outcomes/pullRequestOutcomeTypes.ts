import type { PullRequestOutcome } from "@viberglass/types";

/** Told about each outcome the sweeper records, such as a merge that closes a task. */
export interface PullRequestOutcomeListener {
  onOutcome(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void>;
}
