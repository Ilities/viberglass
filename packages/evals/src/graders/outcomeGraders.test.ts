import type { CorpusRecord, PullRequestOutcome } from "../corpus";
import { pullRequestMerged, reviewComments, runSucceeded } from "./outcomeGraders";

const URL_1 = "https://github.com/acme/app/pull/1";

function record(overrides: Partial<CorpusRecord> = {}): CorpusRecord {
  return {
    jobId: "job-1",
    jobKind: "execution",
    ticketId: "ticket-1",
    agent: "opencode",
    dispatchedAt: "2026-09-30T10:00:00.000Z",
    success: true,
    pullRequestUrl: URL_1,
    costUsd: null,
    costProvenance: "unavailable",
    usageAvailable: false,
    pullRequest: null,
    ...overrides,
  };
}

function withPullRequest(outcome: Partial<PullRequestOutcome>): CorpusRecord {
  return record({ pullRequest: { state: "merged", commentCount: 0, reviewCommentCount: 0, ...outcome } });
}

describe("runSucceeded", () => {
  it.each([
    [true, 1],
    [false, 0],
    [null, null],
  ])("grades success %s as %s", (success, value) => {
    expect(runSucceeded.grade(record({ success })).value).toBe(value);
  });
});

describe("pullRequestMerged", () => {
  it("passes a merged PR and fails a closed one", () => {
    expect(pullRequestMerged.grade(withPullRequest({ state: "merged" })).value).toBe(1);
    expect(pullRequestMerged.grade(withPullRequest({ state: "closed" })).value).toBe(0);
  });

  it.each([
    ["no PR", record({ pullRequestUrl: null })],
    ["an unlabelled PR", record()],
    ["a PR whose checks failed", withPullRequest({ state: null })],
    ["an open PR", withPullRequest({ state: "open" })],
  ])("does not grade %s", (_label, input) => {
    expect(pullRequestMerged.grade(input).value).toBeNull();
  });
});

describe("reviewComments", () => {
  it("counts both kinds of comment on a decided PR", () => {
    expect(reviewComments.grade(withPullRequest({ state: "closed", commentCount: 2, reviewCommentCount: 5 })).value).toBe(7);
  });

  it("does not count comments on an open PR", () => {
    expect(reviewComments.grade(withPullRequest({ state: "open", commentCount: 2 })).value).toBeNull();
  });

  it("does not grade missing counts as zero", () => {
    expect(reviewComments.grade(withPullRequest({ reviewCommentCount: null })).value).toBeNull();
  });
});
