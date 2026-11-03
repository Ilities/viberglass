import type { Selectable } from "kysely";
import type { AppRelease } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type AppReleaseRow = Selectable<Database["app_releases"]>;

export type ReleaseOutcome =
  | { status: "ready"; bundleSha256: string; bundleBytes: number; nodeVersion: string; buildLog: string }
  | { status: "failed"; failureReason: string; buildLog: string | null };

export class AppReleaseDAO {
  /** Null when this commit already has a release, so a commit is only ever built once. */
  async createBuilding(projectId: string, commitSha: string): Promise<AppRelease | null> {
    const row = await db
      .insertInto("app_releases")
      .values({ project_id: projectId, commit_sha: commitSha })
      .onConflict((conflict) => conflict.columns(["project_id", "commit_sha"]).doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? toRelease(row) : null;
  }

  async setJob(releaseId: string, jobId: string): Promise<void> {
    await db.updateTable("app_releases").set({ job_id: jobId }).where("id", "=", releaseId).execute();
  }

  async delete(releaseId: string): Promise<void> {
    await db.deleteFrom("app_releases").where("id", "=", releaseId).execute();
  }

  async getById(releaseId: string): Promise<AppRelease | null> {
    const row = await db.selectFrom("app_releases").selectAll().where("id", "=", releaseId).executeTakeFirst();
    return row ? toRelease(row) : null;
  }

  async getByJobId(jobId: string): Promise<AppRelease | null> {
    const row = await db.selectFrom("app_releases").selectAll().where("job_id", "=", jobId).executeTakeFirst();
    return row ? toRelease(row) : null;
  }

  async hasCommit(projectId: string, commitSha: string): Promise<boolean> {
    const row = await db
      .selectFrom("app_releases")
      .select("id")
      .where("project_id", "=", projectId)
      .where("commit_sha", "=", commitSha)
      .executeTakeFirst();
    return Boolean(row);
  }

  /** Only a release still building takes an outcome; returns whether this one did. */
  async finish(releaseId: string, outcome: ReleaseOutcome): Promise<boolean> {
    const result = await db
      .updateTable("app_releases")
      .set(
        outcome.status === "ready"
          ? {
              status: "ready",
              bundle_sha256: outcome.bundleSha256,
              bundle_bytes: outcome.bundleBytes,
              node_version: outcome.nodeVersion,
              build_log: outcome.buildLog,
              finished_at: new Date(),
            }
          : { status: "failed", failure_reason: outcome.failureReason, build_log: outcome.buildLog, finished_at: new Date() },
      )
      .where("id", "=", releaseId)
      .where("status", "=", "building")
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /** Builds whose run ended, or never got one, without reporting; their run's failure says why. */
  async failAbandoned(startedBefore: Date): Promise<number> {
    const result = await db
      .updateTable("app_releases")
      .set({ status: "failed", failure_reason: "The build stopped without reporting a result", finished_at: new Date() })
      .where("status", "=", "building")
      .where((eb) =>
        eb.or([
          eb.and([eb("job_id", "is", null), eb("created_at", "<", startedBefore)]),
          eb.exists(
            eb.selectFrom("jobs")
              .select("jobs.id")
              .whereRef("jobs.id", "=", "app_releases.job_id")
              .where("jobs.status", "in", ["completed", "failed", "cancelled"]),
          ),
        ]),
      )
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }
}

function toRelease(row: AppReleaseRow): AppRelease {
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
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at ? row.finished_at.toISOString() : null,
  };
}
