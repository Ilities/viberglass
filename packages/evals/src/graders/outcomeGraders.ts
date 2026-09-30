import type { CorpusRecord } from "../corpus";
import type { Grade, Grader } from "../grader";

/** Did the worker report success? Says nothing about whether the work was right. */
export const runSucceeded: Grader = {
  name: "run_succeeded",
  version: "1",
  kind: "pass_fail",
  grade(record) {
    if (record.success === null) return { value: null, reason: "Run never reported a result" };
    return record.success
      ? { value: 1, reason: "Run reported success" }
      : { value: 0, reason: "Run reported failure" };
  },
};

/**
 * Did a person merge the PR? The strongest outcome label available: merging
 * is a human judgement. Open PRs are not graded until they are decided.
 */
export const pullRequestMerged: Grader = {
  name: "pull_request_merged",
  version: "1",
  kind: "pass_fail",
  grade(record) {
    const decided = decidedPullRequest(record);
    if ("value" in decided) return decided;
    return decided.state === "merged"
      ? { value: 1, reason: "Merged" }
      : { value: 0, reason: "Closed without merging" };
  },
};

/**
 * Conversation plus inline review comments on a decided PR — a proxy for how
 * much reviewer effort the change needed.
 */
export const reviewComments: Grader = {
  name: "review_comments",
  version: "1",
  kind: "count",
  grade(record) {
    const decided = decidedPullRequest(record);
    if ("value" in decided) return decided;
    if (decided.commentCount === null || decided.reviewCommentCount === null) {
      return { value: null, reason: "Comment counts not recorded" };
    }
    const total = decided.commentCount + decided.reviewCommentCount;
    return { value: total, reason: `${total} comments` };
  },
};

export const OUTCOME_GRADERS: Grader[] = [runSucceeded, pullRequestMerged, reviewComments];

type DecidedPullRequest = NonNullable<CorpusRecord["pullRequest"]> & { state: "merged" | "closed" };

function decidedPullRequest(record: CorpusRecord): DecidedPullRequest | Grade {
  if (!record.pullRequestUrl) return { value: null, reason: "No pull request" };
  const pullRequest = record.pullRequest;
  if (!pullRequest || pullRequest.state === null) return { value: null, reason: "Pull request not labelled yet" };
  if (pullRequest.state === "open") return { value: null, reason: "Pull request still open" };
  return { ...pullRequest, state: pullRequest.state };
}
