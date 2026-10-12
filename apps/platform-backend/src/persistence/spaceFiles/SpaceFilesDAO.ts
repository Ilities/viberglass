import { sql, type Selectable } from "kysely";
import type { SpaceFilesManifestEntry, SpaceFilesSnapshotSummary } from "@viberglass/types";
import db from "../config/database";
import type { Database, SpaceFileRunStatus } from "../types/database";

type SnapshotRow = Selectable<Database["space_file_snapshots"]>;

export interface SpaceFileRun {
  jobId: string;
  projectId: string;
  status: SpaceFileRunStatus;
  baseSnapshotId: string | null;
  checkpointSnapshotId: string;
  leaseToken: string | null;
}

export interface SpaceFileSnapshot extends SpaceFilesSnapshotSummary {
  projectId: string;
  jobId: string | null;
  storageUrl: string;
  archiveSha256: string;
  archiveBytes: number;
  manifest: SpaceFilesManifestEntry[];
}

export interface NewSpaceFileSnapshot {
  id: string;
  projectId: string;
  parentId: string | null;
  jobId: string;
  storageUrl: string;
  archiveSha256: string;
  archiveBytes: number;
  totalBytes: number;
  manifest: SpaceFilesManifestEntry[];
  changes: SpaceFilesSnapshotSummary["changes"];
  partial: boolean;
}

/** Why a run's files couldn't become the space's current files. */
export type CommitRefusal = "not_running" | "lease_lost" | "space_moved_on";

export class SpaceFilesDAO {
  async createRun(jobId: string, projectId: string, checkpointSnapshotId: string): Promise<void> {
    await db
      .insertInto("space_file_runs")
      .values({ job_id: jobId, project_id: projectId, status: "waiting", checkpoint_snapshot_id: checkpointSnapshotId })
      .execute();
    await db
      .insertInto("space_file_state")
      .values({ project_id: projectId })
      .onConflict((oc) => oc.column("project_id").doNothing())
      .execute();
  }

  async getRun(jobId: string): Promise<SpaceFileRun | null> {
    const row = await db.selectFrom("space_file_runs").selectAll().where("job_id", "=", jobId).executeTakeFirst();
    return row
      ? {
          jobId: row.job_id,
          projectId: row.project_id,
          status: row.status,
          baseSnapshotId: row.base_snapshot_id,
          checkpointSnapshotId: row.checkpoint_snapshot_id,
          leaseToken: row.lease_token,
        }
      : null;
  }

  /**
   * Gives the space's lease to its longest-waiting run when nobody holds it, or
   * the holder's lease ran out, and pins the space's current files for it.
   */
  async startNextWaiting(projectId: string, leaseMs: number): Promise<SpaceFileRun | null> {
    return db.transaction().execute(async (trx) => {
      const next = await trx
        .selectFrom("space_file_runs")
        .select("job_id")
        .where("project_id", "=", projectId)
        .where("status", "=", "waiting")
        .orderBy("created_at", "asc")
        .limit(1)
        .forUpdate()
        .skipLocked()
        .executeTakeFirst();
      if (!next) return null;
      const lease = await trx
        .updateTable("space_file_state")
        .set({
          lease_job_id: next.job_id,
          lease_token: sql`lease_token + 1`,
          lease_expires_at: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
          updated_at: sql`now()`,
        })
        .where("project_id", "=", projectId)
        .where((eb) => eb.or([eb("lease_job_id", "is", null), eb("lease_expires_at", "<", sql<Date>`now()`)]))
        .returning(["lease_token", "current_snapshot_id"])
        .executeTakeFirst();
      if (!lease) return null;
      const run = await trx
        .updateTable("space_file_runs")
        .set({
          status: "running",
          base_snapshot_id: lease.current_snapshot_id,
          lease_token: lease.lease_token,
          started_at: sql`now()`,
        })
        .where("job_id", "=", next.job_id)
        .returningAll()
        .executeTakeFirstOrThrow();
      return {
        jobId: run.job_id,
        projectId: run.project_id,
        status: run.status,
        baseSnapshotId: run.base_snapshot_id,
        checkpointSnapshotId: run.checkpoint_snapshot_id,
        leaseToken: run.lease_token,
      };
    });
  }

  /** Keeps a running job's lease while it is alive; false once it no longer holds it. */
  async renewLease(jobId: string, leaseMs: number): Promise<boolean> {
    const result = await db
      .updateTable("space_file_state")
      .set({ lease_expires_at: sql`now() + ${`${leaseMs} milliseconds`}::interval`, updated_at: sql`now()` })
      .where("lease_job_id", "=", jobId)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /** Whether the run still holds its space's lease with the token it was given. */
  async holdsLease(run: SpaceFileRun): Promise<boolean> {
    if (run.leaseToken === null) return false;
    const row = await db
      .selectFrom("space_file_state")
      .select("project_id")
      .where("project_id", "=", run.projectId)
      .where("lease_job_id", "=", run.jobId)
      .where("lease_token", "=", run.leaseToken)
      .executeTakeFirst();
    return Boolean(row);
  }

  /**
   * Makes a run's saved files the space's current files and frees the space,
   * only if the run still holds the lease and nothing else was saved since it
   * started. Saving the same run again returns what was saved the first time.
   */
  async commitCheckpoint(snapshot: NewSpaceFileSnapshot): Promise<SpaceFileSnapshot | CommitRefusal> {
    return db.transaction().execute(async (trx) => {
      const run = await trx
        .selectFrom("space_file_runs")
        .selectAll()
        .where("job_id", "=", snapshot.jobId)
        .forUpdate()
        .executeTakeFirst();
      if (!run) return "not_running";
      if (run.status === "saved") {
        const saved = await trx
          .selectFrom("space_file_snapshots")
          .selectAll()
          .where("id", "=", run.checkpoint_snapshot_id)
          .executeTakeFirst();
        return saved ? toSnapshot(saved) : "not_running";
      }
      if (run.status !== "running") return "not_running";
      const state = await trx
        .selectFrom("space_file_state")
        .selectAll()
        .where("project_id", "=", run.project_id)
        .forUpdate()
        .executeTakeFirst();
      if (!state || state.lease_job_id !== run.job_id || state.lease_token !== run.lease_token) return "lease_lost";
      if (state.current_snapshot_id !== run.base_snapshot_id) return "space_moved_on";

      const row = await trx
        .insertInto("space_file_snapshots")
        .values({
          id: snapshot.id,
          project_id: snapshot.projectId,
          parent_snapshot_id: snapshot.parentId,
          job_id: snapshot.jobId,
          storage_url: snapshot.storageUrl,
          archive_sha256: snapshot.archiveSha256,
          archive_bytes: snapshot.archiveBytes,
          file_count: snapshot.manifest.length,
          total_bytes: snapshot.totalBytes,
          manifest: JSON.stringify(snapshot.manifest),
          changes: JSON.stringify(snapshot.changes),
          partial: snapshot.partial,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("space_file_state")
        .set({ current_snapshot_id: snapshot.id, lease_job_id: null, lease_expires_at: null, updated_at: sql`now()` })
        .where("project_id", "=", run.project_id)
        .execute();
      await trx
        .updateTable("space_file_runs")
        .set({ status: "saved", finished_at: sql`now()` })
        .where("job_id", "=", run.job_id)
        .execute();
      return toSnapshot(row);
    });
  }

  /** Ends a run that won't save: frees its lease if it holds one. Returns its space, or null when there was nothing to end. */
  async release(jobId: string): Promise<string | null> {
    return db.transaction().execute(async (trx) => {
      const run = await trx
        .updateTable("space_file_runs")
        .set({ status: "released", finished_at: sql`now()` })
        .where("job_id", "=", jobId)
        .where("status", "in", ["waiting", "running"])
        .returning(["project_id"])
        .executeTakeFirst();
      if (!run) return null;
      await trx
        .updateTable("space_file_state")
        .set({ lease_job_id: null, lease_expires_at: null, updated_at: sql`now()` })
        .where("project_id", "=", run.project_id)
        .where("lease_job_id", "=", jobId)
        .execute();
      return run.project_id;
    });
  }

  /** Runs whose job ended without ending the run, for the sweeper to release. */
  async listRunsOfFinishedJobs(): Promise<string[]> {
    const rows = await db
      .selectFrom("space_file_runs")
      .innerJoin("jobs", "jobs.id", "space_file_runs.job_id")
      .select("space_file_runs.job_id")
      .where("space_file_runs.status", "in", ["waiting", "running"])
      .where("jobs.status", "in", ["completed", "failed", "cancelled"])
      .execute();
    return rows.map((row) => row.job_id);
  }

  /** Spaces with a run waiting while the space is free or its holder's lease ran out. */
  async listStartableSpaces(): Promise<string[]> {
    const rows = await db
      .selectFrom("space_file_runs")
      .innerJoin("space_file_state", "space_file_state.project_id", "space_file_runs.project_id")
      .select("space_file_runs.project_id")
      .distinct()
      .where("space_file_runs.status", "=", "waiting")
      .where((eb) =>
        eb.or([
          eb("space_file_state.lease_job_id", "is", null),
          eb("space_file_state.lease_expires_at", "<", sql<Date>`now()`),
        ]),
      )
      .execute();
    return rows.map((row) => row.project_id);
  }

  async getSnapshot(id: string): Promise<SpaceFileSnapshot | null> {
    const row = await db.selectFrom("space_file_snapshots").selectAll().where("id", "=", id).executeTakeFirst();
    return row ? toSnapshot(row) : null;
  }

  async getSnapshotForJob(jobId: string): Promise<SpaceFileSnapshot | null> {
    const row = await db
      .selectFrom("space_file_snapshots")
      .selectAll()
      .where("job_id", "=", jobId)
      .orderBy("created_at", "desc")
      .executeTakeFirst();
    return row ? toSnapshot(row) : null;
  }

  async setWaitingProgress(jobId: string, message: string): Promise<void> {
    await db
      .updateTable("jobs")
      .set({ progress: JSON.stringify({ message, timestamp: Date.now() }) })
      .where("id", "=", jobId)
      .where("status", "=", "queued")
      .execute();
  }
}

function toSnapshot(row: SnapshotRow): SpaceFileSnapshot {
  return {
    id: row.id,
    parentId: row.parent_snapshot_id,
    projectId: row.project_id,
    jobId: row.job_id,
    storageUrl: row.storage_url,
    archiveSha256: row.archive_sha256,
    archiveBytes: Number(row.archive_bytes),
    fileCount: row.file_count,
    totalBytes: Number(row.total_bytes),
    manifest: row.manifest,
    changes: row.changes,
    partial: row.partial,
    createdAt: row.created_at.toISOString(),
  };
}
