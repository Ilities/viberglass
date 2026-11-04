import type { PullRequestOutcome } from "@viberglass/types";

/** Who merged a pull request through Viberglass, which the code host only knows as the connection's account. */
export interface MergeAttribution {
  /** The person who made an App space's change live. */
  madeLiveBy: string;
}

/** Told about each outcome the sweeper records, such as a merge that closes a task. */
export interface PullRequestOutcomeListener {
  onOutcome(pullRequestUrl: string, outcome: PullRequestOutcome, attribution?: MergeAttribution): Promise<void>;
}
