import db from "../config/database";
import type { DataRestoreOrder } from "./AppDAO";

/** Work on an app's data that the next sweep does: a backup a maintainer asked for, or a schedule's restore. */
export class AppDataOrderDAO {
  /** False when a restore is already waiting; that one runs first. */
  async orderRestore(projectId: string, order: DataRestoreOrder): Promise<boolean> {
    const row = await db
      .updateTable("apps")
      .set({ restore_backup_id: order.backupId, restore_execution_id: order.executionId, updated_at: new Date() })
      .where("project_id", "=", projectId)
      .where("restore_backup_id", "is", null)
      .returning("project_id")
      .executeTakeFirst();
    return row !== undefined;
  }

  async clearRestore(projectId: string, backupId: string): Promise<void> {
    await db
      .updateTable("apps")
      .set({ restore_backup_id: null, restore_execution_id: null })
      .where("project_id", "=", projectId)
      .where("restore_backup_id", "=", backupId)
      .execute();
  }

  async requestBackup(projectId: string): Promise<void> {
    await db.updateTable("apps").set({ backup_due: true, updated_at: new Date() }).where("project_id", "=", projectId).execute();
  }

  async clearBackup(projectId: string): Promise<void> {
    await db.updateTable("apps").set({ backup_due: false }).where("project_id", "=", projectId).execute();
  }
}
