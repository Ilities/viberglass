import type { CorpusRecord } from "./corpus";
import { OUTCOME_GRADERS, pullRequestMerged } from "./graders/outcomeGraders";
import { buildReport } from "./report";

function record(overrides: Partial<CorpusRecord>): CorpusRecord {
  return {
    jobId: "job",
    jobKind: "execution",
    ticketId: "ticket-1",
    agent: "opencode",
    dispatchedAt: "2026-09-30T10:00:00.000Z",
    success: true,
    pullRequestUrl: null,
    costUsd: null,
    costProvenance: "unavailable",
    usageAvailable: false,
    pullRequest: null,
    ...overrides,
  };
}

const merged = (url: string) => ({ pullRequestUrl: url, pullRequest: { state: "merged" as const, commentCount: 0, reviewCommentCount: 0 } });
const closed = (url: string) => ({ pullRequestUrl: url, pullRequest: { state: "closed" as const, commentCount: 0, reviewCommentCount: 0 } });
const cost = (costUsd: number) => ({ costUsd, costProvenance: "actual" as const });

describe("buildReport", () => {
  it("reports the whole corpus first, then each agent", () => {
    const report = buildReport(
      [record({ agent: "opencode" }), record({ agent: "claude-code" }), record({ agent: null })],
      OUTCOME_GRADERS,
    );

    expect(report.map((group) => [group.group, group.runs])).toEqual([
      ["all", 3],
      ["(unknown agent)", 1],
      ["claude-code", 1],
      ["opencode", 1],
    ]);
  });

  it("averages only graded runs and counts the rest as ungradable", () => {
    const [all] = buildReport(
      [record(merged("u1")), record(closed("u2")), record(merged("u3")), record({})],
      [pullRequestMerged],
    );

    expect(all.graders[0]).toMatchObject({ grader: "pull_request_merged", version: "1", graded: 3, ungradable: 1 });
    expect(all.graders[0].mean).toBeCloseTo(2 / 3);
  });

  it("reports no mean when nothing was graded", () => {
    const [all] = buildReport([record({})], [pullRequestMerged]);

    expect(all.graders[0].mean).toBeNull();
  });

  it("charges every run's cost to the distinct merged PRs", () => {
    const [all] = buildReport(
      [
        record({ ...merged("u1"), ...cost(0.5) }),
        record({ ...merged("u1"), ...cost(0.25) }),
        record({ success: false, ...cost(0.25) }),
      ],
      [],
    );

    expect(all.cost).toEqual({
      runsWithMeasuredCost: 3,
      measuredCostUsd: 1,
      mergedPullRequests: 1,
      costPerMergedPullRequestUsd: 1,
    });
  });

  it("gives no cost per merged PR while any run's cost is unmeasured", () => {
    const [all] = buildReport(
      [record({ ...merged("u1"), ...cost(0.5) }), record({ costUsd: 0.3, costProvenance: "estimated" })],
      [],
    );

    expect(all.cost).toMatchObject({ runsWithMeasuredCost: 1, measuredCostUsd: 0.5, costPerMergedPullRequestUsd: null });
  });
});
