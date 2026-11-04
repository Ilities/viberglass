import type { Selectable } from "kysely";
import type { AppRelease } from "@viberglass/types";
import type { Database } from "../types/database";

type AppReleaseRow = Selectable<Database["app_releases"]>;

export function toRelease(row: AppReleaseRow): AppRelease {
  return {
    id: row.id,
    projectId: row.project_id,
    commitSha: row.commit_sha,
    status: row.status,
    jobId: row.job_id,
    bundleSha256: row.bundle_sha256,
    bundleBytes: row.bundle_bytes === null ? null : Number(row.bundle_bytes),
    nodeVersion: row.node_version,
    buildLog: row.build_log,
    failureReason: row.failure_reason,
    wentLiveAt: row.went_live_at ? row.went_live_at.toISOString() : null,
    liveFailure: row.live_failure,
    ticketId: row.ticket_id,
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  };
}
