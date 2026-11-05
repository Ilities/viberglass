import type { Selectable } from "kysely";
import type { AppPower, AppRunState } from "@viberglass/types";
import db from "../config/database";
import type { Database } from "../types/database";

type AppRow = Selectable<Database["apps"]>;

export interface AppRecord {
  projectId: string;
  power: AppPower;
  state: AppRunState;
  statusMessage: string | null;
  currentReleaseId: string | null;
  busySince: Date | null;
  rollback: RollbackOrder | null;
  /** When the running instance's storage credentials expire; null when the host's role supplies them. */
  credentialsExpireAt: Date | null;
  /** The space was archived and a last copy of the data is owed once the app is off. */
  archiveBackupDue: boolean;
  /** Its settings changed while it ran, so it's restarted with them. */
  restartDue: boolean;
}

/** A rollback a maintainer asked for, done on the app's next switch. */
export interface RollbackOrder {
  releaseId: string;
  /** The data to restore; null keeps today's. */
  backupId: string | null;
  requestedBy: string;
}

export type AppChange = Partial<Pick<AppRecord, "power" | "state" | "statusMessage" | "currentReleaseId">>;

export class AppDAO {
  async get(projectId: string): Promise<AppRecord | null> {
    const row = await db.selectFrom("apps").selectAll().where("project_id", "=", projectId).executeTakeFirst();
    return row ? toApp(row) : null;
  }

  /** An app is on from the start, so its first release goes live. */
  async ensure(projectId: string): Promise<AppRecord> {
    await db.insertInto("apps").values({ project_id: projectId }).onConflict((conflict) => conflict.column("project_id").doNothing()).execute();
    const app = await this.get(projectId);
    if (!app) throw new Error(`App for space ${projectId} disappeared`);
    return app;
  }

  /**
   * Marks the app busy for one start, stop or switch. Null when another is in
   * progress; one that began before `staleBefore` is taken to have died with its process.
   */
  async claim(projectId: string, staleBefore: Date): Promise<AppRecord | null> {
    const row = await db
      .updateTable("apps")
      .set({ busy_since: new Date() })
      .where("project_id", "=", projectId)
      .where((eb) => eb.or([eb("busy_since", "is", null), eb("busy_since", "<", staleBefore)]))
      .returningAll()
      .executeTakeFirst();
    return row ? toApp(row) : null;
  }

  async update(projectId: string, change: AppChange): Promise<void> {
    await db.updateTable("apps").set({ ...columns(change), updated_at: new Date() }).where("project_id", "=", projectId).execute();
  }

  async orderRollback(projectId: string, order: RollbackOrder): Promise<void> {
    await db
      .updateTable("apps")
      .set({ rollback_release_id: order.releaseId, rollback_backup_id: order.backupId, rollback_by: order.requestedBy, updated_at: new Date() })
      .where("project_id", "=", projectId)
      .execute();
  }

  /** Only clears this release's order, so one asked for meanwhile stays. */
  async clearRollback(projectId: string, releaseId: string): Promise<void> {
    await db
      .updateTable("apps")
      .set({ rollback_release_id: null, rollback_backup_id: null, rollback_by: null })
      .where("project_id", "=", projectId)
      .where("rollback_release_id", "=", releaseId)
      .execute();
  }

  /** Turns the app off for good when its space is archived. */
  async turnOffForArchive(projectId: string, backupDue: boolean): Promise<void> {
    await db
      .updateTable("apps")
      .set({ power: "off", archive_backup_due: backupDue, updated_at: new Date() })
      .where("project_id", "=", projectId)
      .execute();
  }

  /** Only an app that exists can be running with old settings. */
  async requestRestart(projectId: string): Promise<void> {
    await db.updateTable("apps").set({ restart_due: true, updated_at: new Date() }).where("project_id", "=", projectId).execute();
  }

  async clearRestart(projectId: string): Promise<void> {
    await db.updateTable("apps").set({ restart_due: false }).where("project_id", "=", projectId).execute();
  }

  async clearArchiveBackup(projectId: string): Promise<void> {
    await db.updateTable("apps").set({ archive_backup_due: false, updated_at: new Date() }).where("project_id", "=", projectId).execute();
  }

  async recordCredentials(projectId: string, expiresAt: Date | null): Promise<void> {
    await db.updateTable("apps").set({ credentials_expire_at: expiresAt, updated_at: new Date() }).where("project_id", "=", projectId).execute();
  }

  /** Ends what `claim` began. */
  async finish(projectId: string, change: AppChange): Promise<void> {
    await db
      .updateTable("apps")
      .set({ ...columns(change), busy_since: null, updated_at: new Date() })
      .where("project_id", "=", projectId)
      .execute();
  }
}

function columns(change: AppChange): Partial<Pick<AppRow, "power" | "state" | "status_message" | "current_release_id">> {
  return {
    ...(change.power !== undefined ? { power: change.power } : {}),
    ...(change.state !== undefined ? { state: change.state } : {}),
    ...(change.statusMessage !== undefined ? { status_message: change.statusMessage } : {}),
    ...(change.currentReleaseId !== undefined ? { current_release_id: change.currentReleaseId } : {}),
  };
}

function toApp(row: AppRow): AppRecord {
  return {
    projectId: row.project_id,
    power: row.power,
    state: row.state,
    statusMessage: row.status_message,
    currentReleaseId: row.current_release_id,
    busySince: row.busy_since,
    credentialsExpireAt: row.credentials_expire_at,
    archiveBackupDue: row.archive_backup_due,
    restartDue: row.restart_due,
    rollback:
      row.rollback_release_id && row.rollback_by
        ? { releaseId: row.rollback_release_id, backupId: row.rollback_backup_id, requestedBy: row.rollback_by }
        : null,
  };
}
