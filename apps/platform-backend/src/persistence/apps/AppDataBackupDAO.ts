import db from "../config/database";

export interface NewAppDataBackup {
  id: string;
  projectId: string;
  reason: "release";
  releaseId: string | null;
  objects: number;
  bytes: number;
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
        objects: backup.objects,
        bytes: backup.bytes,
      })
      .execute();
  }
}
