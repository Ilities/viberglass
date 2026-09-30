import { isObjectRecord } from "@viberglass/types";
import type { RunPullRequestOutcome, RunRecord, RunTokenUsage } from "@viberglass/types";
import type { RunRecordRow } from "../../persistence/job/RunRecordDAO";

export function toRunRecord(row: RunRecordRow): RunRecord {
  return {
    jobId: row.job_id,
    jobKind: row.job_kind,
    projectSlug: row.project_slug,
    ticketId: row.ticket_id,
    ticketTitle: row.ticket_title,
    clankerName: row.clanker_name,
    clankerSlug: row.clanker_slug,
    requestedAgent: row.requested_agent,
    agent: row.agent,
    modelSnapshot: row.model_snapshot,
    harnessVersion: row.harness_version,
    repository: row.repository,
    baseBranch: row.base_branch,
    branch: row.branch,
    baseSha: row.base_sha,
    commitSha: row.commit_sha,
    workerType: row.worker_type,
    computeImage: row.compute_image,
    configHash: row.config_hash,
    instructionsHash: row.instructions_hash,
    promptHash: row.prompt_hash,
    promptCharacters: row.prompt_characters,
    changedFileCount: row.changed_file_count,
    success: row.success,
    stopReason: row.stop_reason,
    errorMessage: row.error_message,
    usageAvailable: row.usage_available,
    usage: toUsage(row.usage),
    costUsd: row.cost_usd === null ? null : Number(row.cost_usd),
    costProvenance: row.cost_provenance,
    dispatchedAt: toIso(row.dispatched_at),
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
    durationMs: row.duration_ms,
    manifestVersion: row.manifest_version,
    pullRequest: toPullRequest(row),
  };
}

function toPullRequest(row: RunRecordRow): RunPullRequestOutcome | null {
  if (!row.pull_request_url) return null;
  return {
    url: row.pull_request_url,
    state: row.pr_state,
    mergedAt: toIsoOrNull(row.pr_merged_at),
    closedAt: toIsoOrNull(row.pr_closed_at),
    commentCount: row.pr_comment_count,
    reviewCommentCount: row.pr_review_comment_count,
    checkedAt: toIsoOrNull(row.pr_checked_at),
    lastError: row.pr_last_error,
  };
}

/** `usage` is jsonb written by the worker; read it field by field. */
function toUsage(value: unknown): RunTokenUsage | null {
  if (!isObjectRecord(value)) return null;
  return {
    inputTokens: toCount(value.inputTokens),
    outputTokens: toCount(value.outputTokens),
    reasoningOutputTokens: toCount(value.reasoningOutputTokens),
    cacheReadInputTokens: toCount(value.cacheReadInputTokens),
    cacheCreationInputTokens: toCount(value.cacheCreationInputTokens),
  };
}

function toCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  return value === null ? null : toIso(value);
}
