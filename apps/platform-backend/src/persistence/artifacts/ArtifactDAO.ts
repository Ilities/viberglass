import { sql, type Kysely, type Selectable } from "kysely";
import type {
  ArtifactDetail,
  ArtifactFormat,
  ArtifactSummary,
  ArtifactVersionFile,
  ArtifactVersionSummary,
  TurnArtifact,
} from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type VersionRow = Selectable<Database["artifact_versions"]>;

/** A version about to be kept; its files are already in storage under `storagePrefix`. */
export interface NewArtifactVersion {
  versionId: string;
  /** The artifact it belongs to; created with `title` when `create` is set. */
  artifactId: string;
  create: boolean;
  projectId: string;
  ticketId: string | null;
  title: string;
  snapshotId: string | null;
  jobId: string | null;
  createdBy: string | null;
  format: ArtifactFormat;
  entrypoint: string;
  files: ArtifactVersionFile[];
  storagePrefix: string;
  totalBytes: number;
}

/** A version with what serving or purging it needs. */
export interface StoredArtifactVersion extends ArtifactVersionSummary {
  projectId: string;
  files: ArtifactVersionFile[];
  storagePrefix: string;
}

export class ArtifactDAO {
  /** Which of these artifacts the task may revise: its own, in its space. */
  async revisableIds(projectId: string, ticketId: string | null, ids: string[]): Promise<Set<string>> {
    if (ids.length === 0 || !ticketId) return new Set();
    const rows = await db
      .selectFrom("artifacts")
      .select("id")
      .where("project_id", "=", projectId)
      .where("ticket_id", "=", ticketId)
      .where("id", "in", ids)
      .execute();
    return new Set(rows.map((row) => row.id));
  }

  /** The task's artifacts, for the agent to revise by id. */
  async listForTicket(ticketId: string): Promise<Array<{ id: string; title: string; entrypoint: string | null }>> {
    return db
      .selectFrom("artifacts")
      .leftJoin("artifact_versions", "artifact_versions.id", "artifacts.current_version_id")
      .select(["artifacts.id", "artifacts.title", "artifact_versions.entrypoint"])
      .where("artifacts.ticket_id", "=", ticketId)
      .orderBy("artifacts.created_at", "asc")
      .execute();
  }

  /** Adds versions in the caller's transaction, numbering each after its artifact's latest. */
  async insertVersions(trx: Kysely<Database>, versions: NewArtifactVersion[]): Promise<TurnArtifact[]> {
    const added: TurnArtifact[] = [];
    for (const version of versions) {
      if (version.create) {
        await trx
          .insertInto("artifacts")
          .values({ id: version.artifactId, project_id: version.projectId, ticket_id: version.ticketId, title: version.title })
          .execute();
      }
      await trx.selectFrom("artifacts").select("id").where("id", "=", version.artifactId).forUpdate().executeTakeFirstOrThrow();
      const latest = await trx
        .selectFrom("artifact_versions")
        .select((eb) => eb.fn.max("number").as("number"))
        .where("artifact_id", "=", version.artifactId)
        .executeTakeFirst();
      const number = Number(latest?.number ?? 0) + 1;
      await trx
        .insertInto("artifact_versions")
        .values({
          id: version.versionId,
          artifact_id: version.artifactId,
          number,
          snapshot_id: version.snapshotId,
          job_id: version.jobId,
          created_by: version.createdBy,
          format: version.format,
          entrypoint: version.entrypoint,
          files: JSON.stringify(version.files),
          storage_prefix: version.storagePrefix,
          total_bytes: version.totalBytes,
        })
        .execute();
      await trx
        .updateTable("artifacts")
        .set({ current_version_id: version.versionId, title: version.title, updated_at: sql`now()` })
        .where("id", "=", version.artifactId)
        .execute();
      added.push({ artifactId: version.artifactId, versionId: version.versionId, title: version.title, number, format: version.format });
    }
    return added;
  }

  /** Artifacts in the space whose current version includes the file, for a person's edit to revise. */
  async listCurrentWithPath(
    projectId: string,
    path: string,
  ): Promise<Array<{ artifactId: string; title: string; format: ArtifactFormat; entrypoint: string; files: ArtifactVersionFile[] }>> {
    const rows = await db
      .selectFrom("artifacts")
      .innerJoin("artifact_versions", "artifact_versions.id", "artifacts.current_version_id")
      .select(["artifacts.id", "artifacts.title", "artifact_versions.format", "artifact_versions.entrypoint", "artifact_versions.files"])
      .where("artifacts.project_id", "=", projectId)
      .where(sql<boolean>`artifact_versions.files @> ${JSON.stringify([{ path }])}::jsonb`)
      .execute();
    return rows.map((row) => ({ artifactId: row.id, title: row.title, format: row.format, entrypoint: row.entrypoint, files: row.files }));
  }

  /**
   * Each task's newest artifact version. A run's version counts from when its
   * turn finished, so the turn itself doesn't read as a later reply.
   */
  async latestForTickets(ticketIds: string[]): Promise<Map<string, { title: string; number: number; at: Date }>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("artifact_versions as v")
      .innerJoin("artifacts as a", "a.id", "v.artifact_id")
      .distinctOn("a.ticket_id")
      .select([
        "a.ticket_id",
        "a.title",
        "v.number",
        sql<Date>`coalesce((select max(t.completed_at) from agent_turns t where t.job_id = v.job_id), v.created_at)`.as("at"),
      ])
      .where("a.ticket_id", "in", ticketIds)
      .orderBy("a.ticket_id")
      .orderBy("v.created_at", "desc")
      .execute();
    return new Map(rows.flatMap((row) => (row.ticket_id ? [[row.ticket_id, { title: row.title, number: row.number, at: row.at }]] : [])));
  }

  async listForJob(jobId: string): Promise<TurnArtifact[]> {
    const rows = await db
      .selectFrom("artifact_versions")
      .innerJoin("artifacts", "artifacts.id", "artifact_versions.artifact_id")
      .select([
        "artifact_versions.id as version_id",
        "artifact_versions.artifact_id",
        "artifact_versions.number",
        "artifact_versions.format",
        "artifacts.title",
      ])
      .where("artifact_versions.job_id", "=", jobId)
      .orderBy("artifacts.title", "asc")
      .execute();
    return rows.map((row) => ({ artifactId: row.artifact_id, versionId: row.version_id, title: row.title, number: row.number, format: row.format }));
  }

  /** The space's artifacts, newest first; with `taskId`, only that task's. */
  async listForSpace(projectId: string, taskId?: string): Promise<ArtifactSummary[]> {
    let query = this.summaryQuery().where("artifacts.project_id", "=", projectId);
    if (taskId) query = query.where("artifacts.ticket_id", "=", taskId);
    const rows = await query.orderBy("artifacts.updated_at", "desc").execute();
    const current = await this.versionsById(rows.flatMap((row) => (row.current_version_id ? [row.current_version_id] : [])));
    return rows.map((row) => toSummary(row, row.current_version_id ? (current.get(row.current_version_id) ?? null) : null));
  }

  async getDetail(projectId: string, artifactId: string): Promise<ArtifactDetail | null> {
    const row = await this.summaryQuery()
      .where("artifacts.project_id", "=", projectId)
      .where("artifacts.id", "=", artifactId)
      .executeTakeFirst();
    if (!row) return null;
    const versions = await db
      .selectFrom("artifact_versions")
      .leftJoin("jobs", "jobs.id", "artifact_versions.job_id")
      .selectAll("artifact_versions")
      .select("jobs.ticket_id as job_ticket_id")
      .where("artifact_id", "=", artifactId)
      .orderBy("number", "desc")
      .execute();
    const summaries = versions.map((version) => toVersion(version, version.job_ticket_id));
    const current = summaries.find((version) => version.id === row.current_version_id) ?? null;
    return { ...toSummary(row, current), versions: summaries };
  }

  async getVersion(projectId: string, artifactId: string, versionId: string): Promise<StoredArtifactVersion | null> {
    const row = await db
      .selectFrom("artifact_versions")
      .innerJoin("artifacts", "artifacts.id", "artifact_versions.artifact_id")
      .leftJoin("jobs", "jobs.id", "artifact_versions.job_id")
      .selectAll("artifact_versions")
      .select(["artifacts.project_id", "jobs.ticket_id as job_ticket_id"])
      .where("artifacts.project_id", "=", projectId)
      .where("artifact_versions.artifact_id", "=", artifactId)
      .where("artifact_versions.id", "=", versionId)
      .executeTakeFirst();
    return row ? toStored(row, row.project_id, row.job_ticket_id) : null;
  }

  /** For the preview origin, which knows only the version from its signed link. */
  async getVersionById(versionId: string): Promise<StoredArtifactVersion | null> {
    const row = await db
      .selectFrom("artifact_versions")
      .innerJoin("artifacts", "artifacts.id", "artifact_versions.artifact_id")
      .selectAll("artifact_versions")
      .select("artifacts.project_id")
      .where("artifact_versions.id", "=", versionId)
      .executeTakeFirst();
    return row ? toStored(row, row.project_id, null) : null;
  }

  /** Versions each artifact keeps beyond its latest `keep`, never its current one, that are still available. */
  async listVersionsToRetire(keep: number): Promise<string[]> {
    const rows = await db
      .selectFrom("artifact_versions")
      .innerJoin("artifacts", "artifacts.id", "artifact_versions.artifact_id")
      .select("artifact_versions.id")
      .where("artifact_versions.unavailable_at", "is", null)
      .where((eb) => eb("artifact_versions.id", "!=", eb.ref("artifacts.current_version_id")))
      .where(
        sql<boolean>`(SELECT count(*) FROM artifact_versions newer
          WHERE newer.artifact_id = artifact_versions.artifact_id AND newer.number > artifact_versions.number) >= ${keep}`,
      )
      .execute();
    return rows.map((row) => row.id);
  }

  async markUnavailable(versionIds: string[]): Promise<void> {
    if (versionIds.length === 0) return;
    await db.updateTable("artifact_versions").set({ unavailable_at: sql`now()` }).where("id", "in", versionIds).where("unavailable_at", "is", null).execute();
  }

  /** Versions marked unavailable at least `graceMs` ago whose files are still stored. */
  async listVersionsToPurge(graceMs: number): Promise<Array<{ id: string; storagePrefix: string }>> {
    const rows = await db
      .selectFrom("artifact_versions")
      .select(["id", "storage_prefix"])
      .where("purged_at", "is", null)
      .where("unavailable_at", "<", sql<Date>`now() - ${`${graceMs} milliseconds`}::interval`)
      .execute();
    return rows.map((row) => ({ id: row.id, storagePrefix: row.storage_prefix }));
  }

  async markPurged(versionId: string): Promise<void> {
    await db.updateTable("artifact_versions").set({ purged_at: sql`now()` }).where("id", "=", versionId).execute();
  }

  private summaryQuery() {
    return db
      .selectFrom("artifacts")
      .leftJoin("tickets", "tickets.id", "artifacts.ticket_id")
      .select([
        "artifacts.id",
        "artifacts.project_id",
        "artifacts.ticket_id",
        "artifacts.title",
        "artifacts.current_version_id",
        "artifacts.updated_at",
        "tickets.task_key",
        (eb) =>
          eb
            .selectFrom("artifact_versions")
            .select((inner) => inner.fn.countAll<string>().as("count"))
            .whereRef("artifact_versions.artifact_id", "=", "artifacts.id")
            .as("version_count"),
      ]);
  }

  private async versionsById(ids: string[]): Promise<Map<string, ArtifactVersionSummary>> {
    if (ids.length === 0) return new Map();
    const rows = await db
      .selectFrom("artifact_versions")
      .leftJoin("jobs", "jobs.id", "artifact_versions.job_id")
      .selectAll("artifact_versions")
      .select("jobs.ticket_id as job_ticket_id")
      .where("artifact_versions.id", "in", ids)
      .execute();
    return new Map(rows.map((row) => [row.id, toVersion(row, row.job_ticket_id)]));
  }
}

interface SummaryRow {
  id: string;
  project_id: string;
  ticket_id: string | null;
  title: string;
  updated_at: Date;
  task_key: string | null;
  version_count: string | null;
}

function toSummary(row: SummaryRow, current: ArtifactVersionSummary | null): ArtifactSummary {
  return {
    id: row.id,
    spaceId: row.project_id,
    taskId: row.ticket_id,
    taskKey: row.task_key,
    title: row.title,
    currentVersion: current,
    versionCount: Number(row.version_count ?? 0),
    updatedAt: row.updated_at.toISOString(),
  };
}

function toVersion(row: VersionRow, jobTicketId: string | null): ArtifactVersionSummary {
  return {
    id: row.id,
    artifactId: row.artifact_id,
    number: row.number,
    format: row.format,
    entrypoint: row.entrypoint,
    fileCount: row.files.length,
    totalBytes: Number(row.total_bytes),
    status: row.unavailable_at ? "expired" : "available",
    producedBy: row.job_id ? { kind: "run", jobId: row.job_id, taskId: jobTicketId } : { kind: "person", userId: row.created_by },
    createdAt: row.created_at.toISOString(),
  };
}

function toStored(row: VersionRow, projectId: string, jobTicketId: string | null): StoredArtifactVersion {
  return { ...toVersion(row, jobTicketId), projectId, files: row.files, storagePrefix: row.storage_prefix };
}
