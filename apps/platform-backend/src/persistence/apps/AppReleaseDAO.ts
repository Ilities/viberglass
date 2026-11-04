import type { AppRelease } from "@viberglass/types";
import db from "../config/database";
import { toRelease } from "./appReleaseRow";

export type ReleaseOutcome =
  | { status: "ready"; bundleSha256: string; bundleBytes: number; nodeVersion: string; buildLog: string }
  | { status: "failed"; failureReason: string; buildLog: string | null };

export class AppReleaseDAO {
  /**
   * Null when this commit already has a release, or a preview build when
   * `preview` is set, so a commit is only ever built once for each.
   */
  async createBuilding(projectId: string, commitSha: string, options: { ticketId?: string | null; preview?: boolean } = {}): Promise<AppRelease | null> {
    const row = await db
      .insertInto("app_releases")
      .values({ project_id: projectId, commit_sha: commitSha, ticket_id: options.ticketId ?? null, preview: options.preview ?? false })
      .onConflict((conflict) => conflict.columns(["project_id", "commit_sha", "preview"]).doNothing())
      .returningAll()
      .executeTakeFirst();
    return row ? toRelease(row) : null;
  }

  /** For a commit whose release was started before its task was known, such as by the branch poll. */
  async linkTicket(projectId: string, commitSha: string, ticketId: string): Promise<void> {
    await db
      .updateTable("app_releases")
      .set({ ticket_id: ticketId })
      .where("project_id", "=", projectId)
      .where("commit_sha", "=", commitSha)
      .where("preview", "=", false)
      .where("ticket_id", "is", null)
      .execute();
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

  /** Newest first. */
  async listForProject(projectId: string, limit: number): Promise<AppRelease[]> {
    const rows = await db
      .selectFrom("app_releases")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("preview", "=", false)
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();
    return rows.map(toRelease);
  }

  /** The newest built release that hasn't failed to go live. */
  async newestLiveCandidate(projectId: string): Promise<AppRelease | null> {
    const row = await db
      .selectFrom("app_releases")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("preview", "=", false)
      .where("status", "=", "ready")
      .where("live_failure", "is", null)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row ? toRelease(row) : null;
  }

  async markLive(releaseId: string): Promise<void> {
    await db.updateTable("app_releases").set({ went_live_at: new Date(), live_failure: null }).where("id", "=", releaseId).execute();
  }

  async markLiveFailure(releaseId: string, reason: string): Promise<void> {
    await db.updateTable("app_releases").set({ live_failure: reason.slice(0, 2000) }).where("id", "=", releaseId).execute();
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
      .where("preview", "=", false)
      .executeTakeFirst();
    return Boolean(row);
  }

  async findPreviewBuild(projectId: string, commitSha: string): Promise<AppRelease | null> {
    const row = await db
      .selectFrom("app_releases")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("commit_sha", "=", commitSha)
      .where("preview", "=", true)
      .executeTakeFirst();
    return row ? toRelease(row) : null;
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
