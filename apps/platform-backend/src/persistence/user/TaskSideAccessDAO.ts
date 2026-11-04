import { sql } from "kysely";
import db from "../config/database";

/** What ties a person to spaces and tasks, beyond their workspace role. */
export class TaskSideAccessDAO {
  /**
   * Takes someone out of every space and task they could act in. Being a
   * task's requester or owner stays, since it records what happened.
   */
  async removeFor(userId: string): Promise<void> {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("space_members").where("user_id", "=", userId).execute();
      await trx.deleteFrom("task_participants").where("user_id", "=", userId).where("role", "in", ["reviewer", "watcher"]).execute();
      await trx
        .updateTable("projects")
        .set({ default_reviewer_ids: sql<string[]>`array_remove(default_reviewer_ids, ${userId}::uuid)` })
        .where(sql<boolean>`${userId}::uuid = ANY(default_reviewer_ids)`)
        .execute();
      await trx.updateTable("projects").set({ default_owner_id: null }).where("default_owner_id", "=", userId).execute();
      await trx.deleteFrom("api_tokens").where("user_id", "=", userId).execute();
    });
  }
}
