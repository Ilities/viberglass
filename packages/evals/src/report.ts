import type { CorpusRecord } from "./corpus";
import type { Grader } from "./grader";

export interface GraderSummary {
  grader: string;
  version: string;
  kind: Grader["kind"];
  graded: number;
  ungradable: number;
  /** Mean over graded runs; the pass rate for pass/fail graders. Null when none were graded. */
  mean: number | null;
}

export interface CostSummary {
  runsWithMeasuredCost: number;
  measuredCostUsd: number;
  mergedPullRequests: number;
  /**
   * Cost of every run in the group, failed ones included, over the distinct
   * PRs merged. Null unless every run has a measured cost: part-measured
   * would understate it.
   */
  costPerMergedPullRequestUsd: number | null;
}

export interface GroupReport {
  group: string;
  runs: number;
  graders: GraderSummary[];
  cost: CostSummary;
}

/** One report for the whole corpus, then one per agent. */
export function buildReport(records: CorpusRecord[], graders: Grader[]): GroupReport[] {
  const byAgent = new Map<string, CorpusRecord[]>();
  for (const record of records) {
    const agent = record.agent ?? "(unknown agent)";
    byAgent.set(agent, [...(byAgent.get(agent) ?? []), record]);
  }

  return [
    summarizeGroup("all", records, graders),
    ...[...byAgent.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([agent, group]) => summarizeGroup(agent, group, graders)),
  ];
}

function summarizeGroup(group: string, records: CorpusRecord[], graders: Grader[]): GroupReport {
  return {
    group,
    runs: records.length,
    graders: graders.map((grader) => summarizeGrader(grader, records)),
    cost: summarizeCost(records),
  };
}

function summarizeGrader(grader: Grader, records: CorpusRecord[]): GraderSummary {
  const values = records.flatMap((record) => {
    const { value } = grader.grade(record);
    return value === null ? [] : [value];
  });
  return {
    grader: grader.name,
    version: grader.version,
    kind: grader.kind,
    graded: values.length,
    ungradable: records.length - values.length,
    mean: values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
  };
}

function summarizeCost(records: CorpusRecord[]): CostSummary {
  const measured = records.flatMap((record) =>
    record.costProvenance === "actual" && record.costUsd !== null ? [record.costUsd] : [],
  );
  const measuredCostUsd = measured.reduce((sum, cost) => sum + cost, 0);
  const merged = new Set(
    records.flatMap((record) =>
      record.pullRequest?.state === "merged" && record.pullRequestUrl ? [record.pullRequestUrl] : [],
    ),
  );
  const allMeasured = records.length > 0 && measured.length === records.length;

  return {
    runsWithMeasuredCost: measured.length,
    measuredCostUsd,
    mergedPullRequests: merged.size,
    costPerMergedPullRequestUsd: allMeasured && merged.size > 0 ? measuredCostUsd / merged.size : null,
  };
}
