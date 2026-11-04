import db from "../config/database";

export interface AppSpaceRef {
  projectId: string;
  slug: string;
  name: string;
  isPrivate: boolean;
}

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

  /** The App space an app's host name points at. */
  findBySlug(slug: string): Promise<AppSpaceRef | null> {
    return this.findWhere("slug", slug);
  }

  findById(projectId: string): Promise<AppSpaceRef | null> {
    return this.findWhere("id", projectId);
  }

  private async findWhere(column: "id" | "slug", value: string): Promise<AppSpaceRef | null> {
    const row = await db
      .selectFrom("projects")
      .select(["id", "slug", "name", "is_private"])
      .where(column, "=", value)
      .where("backing_kind", "=", "app")
      .executeTakeFirst();
    return row ? { projectId: row.id, slug: row.slug, name: row.name, isPrivate: row.is_private } : null;
  }
}
