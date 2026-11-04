import type { AppRelease } from "@viberglass/types";
import db from "../config/database";
import { toRelease } from "./appReleaseRow";

/** Which of an app's releases a rollback set aside. */
export class AppReleaseRollbackDAO {
  /**
   * Sets aside every release newer than `target`, and takes the mark off it
   * and older ones, since serving it serves their code too. Returns the
   * releases set aside by this call.
   */
  async setAsideAfter(target: Pick<AppRelease, "id" | "projectId">): Promise<AppRelease[]> {
    return db.transaction().execute(async (trx) => {
      // Compared in the database: timestamps there are finer than the ISO strings releases carry.
      const createdAt = trx.selectFrom("app_releases").select("created_at").where("id", "=", target.id);
      await trx
        .updateTable("app_releases")
        .set({ rolled_back_at: null })
        .where("project_id", "=", target.projectId)
        .where("preview", "=", false)
        .where("created_at", "<=", createdAt)
        .where("rolled_back_at", "is not", null)
        .execute();
      const rows = await trx
        .updateTable("app_releases")
        .set({ rolled_back_at: new Date() })
        .where("project_id", "=", target.projectId)
        .where("preview", "=", false)
        .where("created_at", ">", createdAt)
        .where("rolled_back_at", "is", null)
        .returningAll()
        .execute();
      return rows.map(toRelease);
    });
  }
}
