import { sql, type Selectable } from "kysely";
import type { SpaceFileChangeSummary } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type ChangeRow = Selectable<Database["space_file_changes"]>;

export interface SpaceFileChangeRecord extends SpaceFileChangeSummary {
  projectId: string;
  checkBase: boolean;
  baseSha256: string | null;
  stagedUrl: string | null;
}

export interface NewSpaceFileChange {
  id: string;
  projectId: string;
  createdBy: string;
  kind: "write" | "remove";
  path: string;
  checkBase: boolean;
  baseSha256: string | null;
  stagedUrl: string | null;
  bytes: number | null;
}

export class SpaceFileChangesDAO {
  async insert(change: NewSpaceFileChange): Promise<SpaceFileChangeRecord> {
    const row = await db
      .insertInto("space_file_changes")
      .values({
        id: change.id,
        project_id: change.projectId,
        created_by: change.createdBy,
        kind: change.kind,
        path: change.path,
        check_base: change.checkBase,
        base_sha256: change.baseSha256,
        staged_url: change.stagedUrl,
        bytes: change.bytes,
        status: "waiting",
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return changeOfRow(row);
  }

  async get(projectId: string, id: string): Promise<SpaceFileChangeRecord | null> {
    const row = await db
      .selectFrom("space_file_changes")
      .selectAll()
      .where("id", "=", id)
      .where("project_id", "=", projectId)
      .where("status", "in", ["waiting", "failed"])
      .executeTakeFirst();
    return row ? changeOfRow(row) : null;
  }

  /** Waiting and failed changes, oldest first. */
  async listOpen(projectId: string): Promise<SpaceFileChangeRecord[]> {
    const rows = await db
      .selectFrom("space_file_changes")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("status", "in", ["waiting", "failed"])
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(changeOfRow);
  }

  async listWaiting(projectId: string): Promise<SpaceFileChangeRecord[]> {
    const rows = await db
      .selectFrom("space_file_changes")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("status", "=", "waiting")
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(changeOfRow);
  }

  async listSpacesWithWaiting(): Promise<string[]> {
    const rows = await db.selectFrom("space_file_changes").select("project_id").distinct().where("status", "=", "waiting").execute();
    return rows.map((row) => row.project_id);
  }

  async markSaved(id: string, snapshotId: string | null): Promise<void> {
    await db
      .updateTable("space_file_changes")
      .set({ status: "saved", snapshot_id: snapshotId, staged_url: null, finished_at: sql`now()` })
      .where("id", "=", id)
      .execute();
  }

  async markFailed(id: string, error: string): Promise<void> {
    await db.updateTable("space_file_changes").set({ status: "failed", error, finished_at: sql`now()` }).where("id", "=", id).execute();
  }

  async delete(id: string): Promise<void> {
    await db.deleteFrom("space_file_changes").where("id", "=", id).execute();
  }
}

function changeOfRow(row: ChangeRow): SpaceFileChangeRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    kind: row.kind,
    path: row.path,
    status: row.status === "failed" ? "failed" : "waiting",
    error: row.error,
    hasContent: row.staged_url !== null,
    createdBy: row.created_by,
    createdAt: row.created_at.toISOString(),
    checkBase: row.check_base,
    baseSha256: row.base_sha256,
    stagedUrl: row.staged_url,
  };
}

export function summaryOfChange(change: SpaceFileChangeRecord): SpaceFileChangeSummary {
  return {
    id: change.id,
    kind: change.kind,
    path: change.path,
    status: change.status,
    error: change.error,
    hasContent: change.hasContent,
    createdBy: change.createdBy,
    createdAt: change.createdAt,
  };
}
