import db from "../config/database";

export class AppSpaceDAO {
  /** App spaces that aren't archived, oldest first. */
  async listLiveIds(): Promise<string[]> {
    const rows = await db
      .selectFrom("projects")
      .select("id")
      .where("backing_kind", "=", "app")
      .where("archived_at", "is", null)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map((row) => row.id);
  }
}
