import db from "../config/database";

export interface NewAppDataBackup {
  id: string;
  projectId: string;
  reason: "release" | "rollback";
  /** The release being switched to. */
  releaseId: string | null;
  /** The release whose data it is; null when nothing was serving. */
  fromReleaseId: string | null;
  objects: number;
  bytes: number;
}

/** The newest backup of a release's data: what rolling back to it with data restores. */
export interface DataPoint {
  backupId: string;
  releaseId: string;
  takenAt: Date;
}

export class AppDataBackupDAO {
  async create(backup: NewAppDataBackup): Promise<void> {
    await db
      .insertInto("app_data_backups")
      .values({
        id: backup.id,
        project_id: backup.projectId,
        reason: backup.reason,
        release_id: backup.releaseId,
        from_release_id: backup.fromReleaseId,
        objects: backup.objects,
        bytes: backup.bytes,
      })
      .execute();
  }

  async dataPoints(projectId: string): Promise<DataPoint[]> {
    const rows = await db
      .selectFrom("app_data_backups")
      .select(["id", "from_release_id", "created_at"])
      .distinctOn("from_release_id")
      .where("project_id", "=", projectId)
      .where("from_release_id", "is not", null)
      .orderBy("from_release_id")
      .orderBy("created_at", "desc")
      .execute();
    return rows.flatMap((row) => (row.from_release_id ? [{ backupId: row.id, releaseId: row.from_release_id, takenAt: row.created_at }] : []));
  }

  async dataPointFor(releaseId: string): Promise<DataPoint | null> {
    const row = await db
      .selectFrom("app_data_backups")
      .select(["id", "created_at"])
      .where("from_release_id", "=", releaseId)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row ? { backupId: row.id, releaseId, takenAt: row.created_at } : null;
  }
}
