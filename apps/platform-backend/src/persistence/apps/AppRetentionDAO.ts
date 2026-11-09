import { sql } from "kysely";
import db from "../config/database";

export interface StoredRelease {
  id: string;
  projectId: string;
}

export interface StoredBackup {
  id: string;
  projectId: string;
}

/** Which release bundles and data backups apps no longer need. */
export class AppRetentionDAO {
  /**
   * Ready bundles that aren't the current release, a rollback asked for, used
   * by a preview, or one of each app's `keepLive` releases that went live most
   * recently. A bundle that never went live is kept until `unusedBefore`.
   */
  async listBundlesToRetire(keepLive: number, unusedBefore: Date): Promise<StoredRelease[]> {
    const ranked = db
      .selectFrom("app_releases")
      .select(["id", sql<string>`row_number() over (partition by project_id order by went_live_at desc)`.as("rank")])
      .where("went_live_at", "is not", null)
      .where("preview", "=", false);
    return db
      .selectFrom("app_releases as r")
      .select(["r.id", "r.project_id as projectId"])
      .where("r.status", "=", "ready")
      .where("r.bundle_removed_at", "is", null)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom("apps")
              .select("apps.project_id")
              .where((inner) => inner.or([inner("apps.current_release_id", "=", inner.ref("r.id")), inner("apps.rollback_release_id", "=", inner.ref("r.id"))])),
          ),
        ),
      )
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom("app_previews")
              .select("app_previews.id")
              .where((inner) => inner.or([inner("app_previews.release_id", "=", inner.ref("r.id")), inner("app_previews.running_release_id", "=", inner.ref("r.id"))])),
          ),
        ),
      )
      .where((eb) =>
        eb.or([
          eb.and([
            eb("r.went_live_at", "is not", null),
            eb("r.id", "not in", eb.selectFrom(ranked.as("ranked")).select("ranked.id").where(sql<boolean>`ranked.rank::int <= ${keepLive}`)),
          ]),
          eb.and([eb("r.went_live_at", "is", null), eb("r.created_at", "<", unusedBefore)]),
        ]),
      )
      .execute();
  }

  async markBundlesRemoved(releaseIds: string[]): Promise<void> {
    if (releaseIds.length === 0) return;
    await db.updateTable("app_releases").set({ bundle_removed_at: new Date() }).where("id", "in", releaseIds).execute();
  }

  async listBundlesToPurge(removedBefore: Date): Promise<StoredRelease[]> {
    return db
      .selectFrom("app_releases")
      .select(["id", "project_id as projectId"])
      .where("bundle_removed_at", "<", removedBefore)
      .where("bundle_purged_at", "is", null)
      .execute();
  }

  async markBundlePurged(releaseId: string): Promise<void> {
    await db.updateTable("app_releases").set({ bundle_purged_at: new Date() }).where("id", "=", releaseId).execute();
  }

  /**
   * Backups taken before `takenBefore`, except one a rollback, a restore or a
   * schedule points at, and the newest copy of each release that can still be rolled back to.
   */
  async listBackupsToDelete(takenBefore: Date): Promise<StoredBackup[]> {
    return db
      .selectFrom("app_data_backups as b")
      .select(["b.id", "b.project_id as projectId"])
      .where("b.created_at", "<", takenBefore)
      .where((eb) =>
        eb.not(
          eb.exists(
            eb.selectFrom("apps")
              .select("apps.project_id")
              .where((inner) => inner.or([inner("apps.rollback_backup_id", "=", inner.ref("b.id")), inner("apps.restore_backup_id", "=", inner.ref("b.id"))])),
          ),
        ),
      )
      .where((eb) => eb.not(eb.exists(eb.selectFrom("claw_schedules").select("claw_schedules.id").whereRef("claw_schedules.backup_id", "=", "b.id"))))
      .where((eb) =>
        eb.or([
          eb("b.from_release_id", "is", null),
          eb.exists(
            eb.selectFrom("app_releases")
              .select("app_releases.id")
              .whereRef("app_releases.id", "=", "b.from_release_id")
              .where("app_releases.bundle_removed_at", "is not", null),
          ),
          eb.exists(
            eb.selectFrom("app_data_backups as newer")
              .select("newer.id")
              .whereRef("newer.from_release_id", "=", "b.from_release_id")
              .whereRef("newer.created_at", ">", "b.created_at"),
          ),
        ]),
      )
      .execute();
  }

  async deleteBackup(backupId: string): Promise<void> {
    await db.deleteFrom("app_data_backups").where("id", "=", backupId).execute();
  }

  /** Git spaces whose app was ejected before `ejectedBefore` and not brought back in. */
  async listEjectedBefore(ejectedBefore: Date): Promise<string[]> {
    const rows = await db
      .selectFrom("apps")
      .innerJoin("projects", "projects.id", "apps.project_id")
      .select("apps.project_id")
      .where("apps.ejected_at", "<", ejectedBefore)
      .where("projects.backing_kind", "=", "git")
      .execute();
    return rows.map((row) => row.project_id);
  }

  /** Once its data is deleted: the app's row and backups go, and its bundles are retired to be purged. */
  async forgetEjected(projectId: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("app_data_backups").where("project_id", "=", projectId).execute();
      await trx
        .updateTable("app_releases")
        .set({ bundle_removed_at: new Date() })
        .where("project_id", "=", projectId)
        .where("bundle_removed_at", "is", null)
        .execute();
      await trx.deleteFrom("apps").where("project_id", "=", projectId).execute();
    });
  }
}
