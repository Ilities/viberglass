import type { AppAccessPerson } from "@viberglass/types";
import db from "../config/database";

/** App access lists: people beyond the space's members who may open an app. */
export class AppAccessDAO {
  async list(projectId: string): Promise<AppAccessPerson[]> {
    const rows = await db
      .selectFrom("app_access")
      .innerJoin("users", "users.id", "app_access.user_id")
      .select(["users.id", "users.name", "users.email", "users.role", "app_access.created_at"])
      .where("app_access.project_id", "=", projectId)
      .where("users.deactivated_at", "is", null)
      .orderBy("users.name", "asc")
      .execute();
    return rows.map((row) => ({
      userId: row.id,
      name: row.name,
      email: row.email,
      workspaceRole: row.role,
      addedAt: row.created_at.toISOString(),
    }));
  }

  async has(projectId: string, userId: string): Promise<boolean> {
    const row = await db
      .selectFrom("app_access")
      .select("user_id")
      .where("project_id", "=", projectId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return Boolean(row);
  }

  /** The apps this person is on the list of. */
  async projectIdsFor(userId: string): Promise<string[]> {
    const rows = await db.selectFrom("app_access").select("project_id").where("user_id", "=", userId).execute();
    return rows.map((row) => row.project_id);
  }

  async add(input: { projectId: string; userId: string; addedBy: string }): Promise<void> {
    await db
      .insertInto("app_access")
      .values({ project_id: input.projectId, user_id: input.userId, added_by: input.addedBy })
      .onConflict((oc) => oc.columns(["project_id", "user_id"]).doNothing())
      .execute();
  }

  /** True when the person was on the list. */
  async remove(projectId: string, userId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("app_access")
      .where("project_id", "=", projectId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
