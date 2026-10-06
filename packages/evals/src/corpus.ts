/**
 * The eval corpus as the platform exports it: one NDJSON line per job from
 * `GET /api/run-manifests/export`, `{ manifest, pullRequestOutcome, logs? }`,
 * with database column names.
 *
 * Only the fields graders read are typed. A field the platform did not
 * record parses as null, never as a default, so "unknown" stays distinct
 * from "false" or "zero".
 */
export type PullRequestState = "open" | "closed" | "merged";
export type CostProvenance = "actual" | "estimated" | "unavailable";

export interface CorpusRecord {
  jobId: string;
  jobKind: string;
  /**
   * The task the run worked on — the sampling unit. A ticket's
   * planning, execution and retried runs share it. Null for runs with no
   * ticket, such as claws.
   */
  ticketId: string | null;
  /** The agent that ran, else the one requested. */
  agent: string | null;
  dispatchedAt: string;
  success: boolean | null;
  pullRequestUrl: string | null;
  costUsd: number | null;
  costProvenance: CostProvenance | null;
  usageAvailable: boolean | null;
  pullRequest: PullRequestOutcome | null;
}

export interface PullRequestOutcome {
  /** Null when every check so far failed. */
  state: PullRequestState | null;
  commentCount: number | null;
  reviewCommentCount: number | null;
}

export function parseCorpus(ndjson: string): CorpusRecord[] {
  return ndjson
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter(({ line }) => line.length > 0)
    .map(({ line, lineNumber }) => parseRecord(line, lineNumber));
}

function parseRecord(line: string, lineNumber: number): CorpusRecord {
  const parsed: unknown = JSON.parse(line);
  if (!isRecord(parsed) || !isRecord(parsed.manifest)) {
    throw new Error(`Line ${lineNumber}: expected { manifest, ... }`);
  }
  const manifest = parsed.manifest;
  const jobId = asString(manifest.job_id);
  const jobKind = asString(manifest.job_kind);
  const dispatchedAt = asString(manifest.dispatched_at);
  if (!jobId || !jobKind || !dispatchedAt) {
    throw new Error(`Line ${lineNumber}: manifest needs job_id, job_kind and dispatched_at`);
  }

  return {
    jobId,
    jobKind,
    ticketId: asString(manifest.ticket_id),
    agent: asString(manifest.agent) ?? asString(manifest.requested_agent),
    dispatchedAt,
    success: asBoolean(manifest.success),
    pullRequestUrl: asString(manifest.pull_request_url),
    costUsd: asNumber(manifest.cost_usd),
    costProvenance: asCostProvenance(manifest.cost_provenance),
    usageAvailable: asBoolean(manifest.usage_available),
    pullRequest: isRecord(parsed.pullRequestOutcome)
      ? parseOutcome(parsed.pullRequestOutcome)
      : null,
  };
}

function parseOutcome(outcome: Record<string, unknown>): PullRequestOutcome {
  const state = outcome.state;
  return {
    state: state === "open" || state === "closed" || state === "merged" ? state : null,
    commentCount: asNumber(outcome.comment_count),
    reviewCommentCount: asNumber(outcome.review_comment_count),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Postgres numerics arrive as strings, to keep their precision. */
function asNumber(value: unknown): number | null {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) ? number : null;
}

function asCostProvenance(value: unknown): CostProvenance | null {
  return value === "actual" || value === "estimated" || value === "unavailable" ? value : null;
}
