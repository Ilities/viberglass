import { sql, type ExpressionBuilder, type Selectable } from "kysely";
import type { SpaceFilesManifestEntry, SpaceFilesSnapshotSummary, TurnArtifact } from "@viberglass/types";
import { ArtifactDAO, type NewArtifactVersion } from "../artifacts/ArtifactDAO";
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
  /** The run that saved it, or null for a person's change. */
  jobId: string | null;
  createdBy: string | null;
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
  constructor(private readonly artifacts: Pick<ArtifactDAO, "insertVersions" | "listForJob"> = new ArtifactDAO()) {}

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
          lease_operation_id: null,
          lease_token: sql`lease_token + 1`,
          lease_expires_at: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
          updated_at: sql`now()`,
        })
        .where("project_id", "=", projectId)
        .where(spaceIsFree)
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
  async commitCheckpoint(
    snapshot: NewSpaceFileSnapshot,
    versions: NewArtifactVersion[] = [],
  ): Promise<{ snapshot: SpaceFileSnapshot; artifacts: TurnArtifact[] } | CommitRefusal> {
    return db.transaction().execute(async (trx) => {
      const run = await trx
        .selectFrom("space_file_runs")
        .selectAll()
        .where("job_id", "=", snapshot.jobId ?? "")
        .forUpdate()
        .executeTakeFirst();
      if (!run) return "not_running";
      if (run.status === "saved") {
        const saved = await trx
          .selectFrom("space_file_snapshots")
          .selectAll()
          .where("id", "=", run.checkpoint_snapshot_id)
          .executeTakeFirst();
        return saved ? { snapshot: toSnapshot(saved), artifacts: await this.artifacts.listForJob(run.job_id) } : "not_running";
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
          created_by: snapshot.createdBy,
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
      const artifacts = await this.artifacts.insertVersions(trx, versions);
      return { snapshot: toSnapshot(row), artifacts };
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

  /**
   * Cuts a stopped run's lease short, so its worker has only that long to
   * save what it had done. False when the run doesn't hold its space.
   */
  async shortenLease(jobId: string, withinMs: number): Promise<boolean> {
    const result = await db
      .updateTable("space_file_state")
      .set({
        lease_expires_at: sql`LEAST(lease_expires_at, now() + ${`${withinMs} milliseconds`}::interval)`,
        updated_at: sql`now()`,
      })
      .where("lease_job_id", "=", jobId)
      .where("lease_expires_at", ">", sql<Date>`now()`)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  /**
   * Runs whose job ended without ending the run, for the sweeper to release.
   * A cancelled run still saving within its shortened lease is left to finish.
   */
  async listRunsOfFinishedJobs(): Promise<string[]> {
    const rows = await db
      .selectFrom("space_file_runs")
      .innerJoin("jobs", "jobs.id", "space_file_runs.job_id")
      .select("space_file_runs.job_id")
      .where("space_file_runs.status", "in", ["waiting", "running"])
      .where("jobs.status", "in", ["completed", "failed", "cancelled"])
      .where(
        sql<boolean>`NOT (jobs.status = 'cancelled' AND EXISTS (SELECT 1 FROM space_file_state s WHERE s.lease_job_id = space_file_runs.job_id AND s.lease_expires_at > now()))`,
      )
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
          eb.and([eb("space_file_state.lease_job_id", "is", null), eb("space_file_state.lease_operation_id", "is", null)]),
          eb("space_file_state.lease_expires_at", "<", sql<Date>`now()`),
        ]),
      )
      .execute();
    return rows.map((row) => row.project_id);
  }

  /**
   * Holds the space for a person's change, like a run would, when nobody else
   * does. Returns the token the change must still hold when it saves.
   */
  async acquireForOperation(
    projectId: string,
    operationId: string,
    leaseMs: number,
  ): Promise<{ token: string; currentSnapshotId: string | null } | null> {
    await db.insertInto("space_file_state").values({ project_id: projectId }).onConflict((oc) => oc.column("project_id").doNothing()).execute();
    const row = await db
      .updateTable("space_file_state")
      .set({
        lease_job_id: null,
        lease_operation_id: operationId,
        lease_token: sql`lease_token + 1`,
        lease_expires_at: sql`now() + ${`${leaseMs} milliseconds`}::interval`,
        updated_at: sql`now()`,
      })
      .where("project_id", "=", projectId)
      .where(spaceIsFree)
      .returning(["lease_token", "current_snapshot_id"])
      .executeTakeFirst();
    return row ? { token: row.lease_token, currentSnapshotId: row.current_snapshot_id } : null;
  }

  /** Saves a person's change as the space's current files and frees the space, if the change still holds it. */
  async commitOperation(
    operationId: string,
    token: string,
    snapshot: NewSpaceFileSnapshot,
    versions: NewArtifactVersion[] = [],
  ): Promise<{ snapshot: SpaceFileSnapshot; artifacts: TurnArtifact[] } | "lease_lost"> {
    return db.transaction().execute(async (trx) => {
      const state = await trx
        .selectFrom("space_file_state")
        .selectAll()
        .where("project_id", "=", snapshot.projectId)
        .forUpdate()
        .executeTakeFirst();
      if (!state || state.lease_operation_id !== operationId || state.lease_token !== token) return "lease_lost";
      if (state.current_snapshot_id !== snapshot.parentId) return "lease_lost";
      const row = await trx
        .insertInto("space_file_snapshots")
        .values({
          id: snapshot.id,
          project_id: snapshot.projectId,
          parent_snapshot_id: snapshot.parentId,
          job_id: null,
          created_by: snapshot.createdBy,
          storage_url: snapshot.storageUrl,
          archive_sha256: snapshot.archiveSha256,
          archive_bytes: snapshot.archiveBytes,
          file_count: snapshot.manifest.length,
          total_bytes: snapshot.totalBytes,
          manifest: JSON.stringify(snapshot.manifest),
          changes: JSON.stringify(snapshot.changes),
          partial: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("space_file_state")
        .set({ current_snapshot_id: snapshot.id, lease_operation_id: null, lease_expires_at: null, updated_at: sql`now()` })
        .where("project_id", "=", snapshot.projectId)
        .execute();
      const artifacts = await this.artifacts.insertVersions(trx, versions);
      return { snapshot: toSnapshot(row), artifacts };
    });
  }

  async releaseOperation(projectId: string, operationId: string): Promise<void> {
    await db
      .updateTable("space_file_state")
      .set({ lease_operation_id: null, lease_expires_at: null, updated_at: sql`now()` })
      .where("project_id", "=", projectId)
      .where("lease_operation_id", "=", operationId)
      .execute();
  }

  /** The space's current files, and whether a run or a person holds it right now. */
  async getCurrent(projectId: string): Promise<{ snapshot: SpaceFileSnapshot | null; busy: boolean }> {
    const state = await db.selectFrom("space_file_state").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    if (!state) return { snapshot: null, busy: false };
    const busy =
      (state.lease_job_id !== null || state.lease_operation_id !== null) &&
      state.lease_expires_at !== null &&
      state.lease_expires_at.getTime() > Date.now();
    return { snapshot: state.current_snapshot_id ? await this.getSnapshot(state.current_snapshot_id) : null, busy };
  }

  /**
   * Snapshots each space keeps beyond its latest `keep`: never the current one
   * or one a live run started from.
   */
  async listSnapshotsToRetire(keep: number): Promise<string[]> {
    const rows = await db
      .selectFrom("space_file_snapshots as s")
      .innerJoin("space_file_state as state", "state.project_id", "s.project_id")
      .select("s.id")
      .where("s.unavailable_at", "is", null)
      .where((eb) => eb.or([eb("state.current_snapshot_id", "is", null), eb("s.id", "!=", eb.ref("state.current_snapshot_id"))]))
      .where(sql<boolean>`NOT EXISTS (SELECT 1 FROM space_file_runs r WHERE r.base_snapshot_id = s.id AND r.status IN ('waiting', 'running'))`)
      .where(sql<boolean>`(SELECT count(*) FROM space_file_snapshots newer WHERE newer.project_id = s.project_id AND newer.created_at > s.created_at) >= ${keep}`)
      .execute();
    return rows.map((row) => row.id);
  }

  async markSnapshotsUnavailable(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.updateTable("space_file_snapshots").set({ unavailable_at: sql`now()` }).where("id", "in", ids).where("unavailable_at", "is", null).execute();
  }

  async listSnapshotsToPurge(graceMs: number): Promise<Array<{ id: string; storageUrl: string }>> {
    const rows = await db
      .selectFrom("space_file_snapshots")
      .select(["id", "storage_url"])
      .where("purged_at", "is", null)
      .where("unavailable_at", "<", sql<Date>`now() - ${`${graceMs} milliseconds`}::interval`)
      .execute();
    return rows.map((row) => ({ id: row.id, storageUrl: row.storage_url }));
  }

  async markSnapshotPurged(id: string): Promise<void> {
    await db.updateTable("space_file_snapshots").set({ purged_at: sql`now()` }).where("id", "=", id).execute();
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

/** Nobody holds the space, or whoever did let the lease run out. */
function spaceIsFree(eb: ExpressionBuilder<Database, "space_file_state">) {
  return eb.or([
    eb.and([eb("lease_job_id", "is", null), eb("lease_operation_id", "is", null)]),
    eb("lease_expires_at", "<", sql<Date>`now()`),
  ]);
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
