import type { SpaceMember, SpaceRole } from "@viberglass/types";
import db from "../config/database";

export class SpaceMemberDAO {
  async listMembers(projectId: string): Promise<SpaceMember[]> {
    const rows = await db
      .selectFrom("space_members")
      .innerJoin("users", "users.id", "space_members.user_id")
      .select([
        "space_members.user_id",
        "space_members.role",
        "space_members.created_at",
        "users.name",
        "users.email",
        "users.role as workspace_role",
      ])
      .where("space_members.project_id", "=", projectId)
      .orderBy("users.name", "asc")
      .execute();
    return rows.map((row) => ({
      userId: row.user_id,
      name: row.name,
      email: row.email,
      workspaceRole: row.workspace_role,
      role: row.role,
      addedAt: row.created_at.toISOString(),
    }));
  }

  async getRole(projectId: string, userId: string): Promise<SpaceRole | null> {
    const row = await db
      .selectFrom("space_members")
      .select("role")
      .where("project_id", "=", projectId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return row?.role ?? null;
  }

  /** Spaces a person may see besides admins' all: the ones they belong to, plus open ones unless they're a guest. */
  async listVisibleProjectIds(userId: string, includeOpen: boolean): Promise<string[]> {
    const rows = await db
      .selectFrom("projects")
      .select("projects.id")
      .where((eb) =>
        eb.or([
          ...(includeOpen ? [eb("projects.is_private", "=", false)] : []),
          eb(
            "projects.id",
            "in",
            eb.selectFrom("space_members").select("space_members.project_id").where("space_members.user_id", "=", userId),
          ),
        ]),
      )
      .execute();
    return rows.map((row) => row.id);
  }

  /** Adds the person, or changes their role if they're already a member. */
  async upsert(input: { projectId: string; userId: string; role: SpaceRole; addedBy: string | null }): Promise<void> {
    await db
      .insertInto("space_members")
      .values({ project_id: input.projectId, user_id: input.userId, role: input.role, added_by: input.addedBy })
      .onConflict((oc) => oc.columns(["project_id", "user_id"]).doUpdateSet({ role: input.role }))
      .execute();
  }

  async remove(projectId: string, userId: string): Promise<boolean> {
    const result = await db
      .deleteFrom("space_members")
      .where("project_id", "=", projectId)
      .where("user_id", "=", userId)
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }
}
