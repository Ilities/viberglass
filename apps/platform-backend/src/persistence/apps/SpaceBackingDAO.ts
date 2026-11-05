import { sql, type Transaction } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

export interface EjectedApp {
  ejectedAt: Date;
  /** The backup taken when it was ejected; null when it had never served a release. */
  backupId: string | null;
  /** Size of the SQLite copy to download; null when there's none. */
  copyBytes: number | null;
}

/** Changes a space between git and App in one transaction, the only way a backing may change. */
export class SpaceBackingDAO {
  async ejected(projectId: string): Promise<EjectedApp | null> {
    const row = await db
      .selectFrom("apps")
      .select(["ejected_at", "ejected_backup_id", "ejected_copy_bytes"])
      .where("project_id", "=", projectId)
      .executeTakeFirst();
    if (!row?.ejected_at) return null;
    return { ejectedAt: row.ejected_at, backupId: row.ejected_backup_id, copyBytes: row.ejected_copy_bytes === null ? null : Number(row.ejected_copy_bytes) };
  }

  /** The app is on from the start; one ejected before is reused, with its releases and backups. */
  async makeApp(projectId: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await switchBacking(trx, projectId, "app");
      await trx
        .insertInto("apps")
        .values({ project_id: projectId })
        .onConflict((conflict) =>
          conflict.column("project_id").doUpdateSet({
            power: "on",
            state: "off",
            status_message: null,
            ejected_at: null,
            ejected_backup_id: null,
            ejected_copy_bytes: null,
            updated_at: new Date(),
          }),
        )
        .execute();
    });
  }

  /**
   * Leaves what only an app has: its sessions, access list, settings, app
   * schedules, previews and copies no turn took. The app row stays, off, to
   * find the last copy of its data by.
   */
  async makeGit(projectId: string, ejected: Omit<EjectedApp, "ejectedAt">, now = new Date()): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await switchBacking(trx, projectId, "git");
      await trx.deleteFrom("app_sessions").where("project_id", "=", projectId).execute();
      await trx.deleteFrom("app_handoff_codes").where("project_id", "=", projectId).execute();
      await trx.deleteFrom("app_previews").where("project_id", "=", projectId).execute();
      await trx.deleteFrom("app_access").where("project_id", "=", projectId).execute();
      await trx.deleteFrom("app_settings").where("project_id", "=", projectId).execute();
      await trx.deleteFrom("claw_schedules").where("project_id", "=", projectId).where("action", "!=", "run_template").execute();
      await trx
        .updateTable("app_data_grants")
        .set({ removed_at: now })
        .where("project_id", "=", projectId)
        .where("taken_at", "is", null)
        .where("removed_at", "is", null)
        .execute();
      await this.dropFromOpenInvites(trx, projectId, now);
      await trx
        .updateTable("apps")
        .set({
          power: "off",
          state: "off",
          status_message: null,
          busy_since: null,
          rollback_release_id: null,
          rollback_backup_id: null,
          rollback_by: null,
          archive_backup_due: false,
          restart_due: false,
          ejected_at: now,
          ejected_backup_id: ejected.backupId,
          ejected_copy_bytes: ejected.copyBytes,
          updated_at: now,
        })
        .where("project_id", "=", projectId)
        .execute();
    });
  }

  /** An app user's invite left with no apps is revoked, as when a maintainer cancels it. */
  private async dropFromOpenInvites(trx: Transaction<Database>, projectId: string, now: Date): Promise<void> {
    const changed = await trx
      .updateTable("invites")
      .set({ app_ids: sql<string[]>`array_remove(app_ids, ${projectId}::uuid)` })
      .where(sql<boolean>`${projectId}::uuid = any(app_ids)`)
      .where("accepted_at", "is", null)
      .where("revoked_at", "is", null)
      .returning(["id", "role", "app_ids"])
      .execute();
    const emptied = changed.filter((invite) => invite.role === "app_user" && invite.app_ids.length === 0).map((invite) => invite.id);
    if (emptied.length > 0) await trx.updateTable("invites").set({ revoked_at: now }).where("id", "in", emptied).execute();
  }
}

async function switchBacking(trx: Transaction<Database>, projectId: string, to: "git" | "app"): Promise<void> {
  await sql`SELECT set_config('viberglass.switching_backing', 'on', true)`.execute(trx);
  await trx.updateTable("projects").set({ backing_kind: to, updated_at: new Date() }).where("id", "=", projectId).execute();
}
