import type { AppRunState } from "@viberglass/types";
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

  /** App spaces that aren't archived, by name, with what their app is doing. */
  async listLive(): Promise<Array<AppSpaceRef & { state: AppRunState }>> {
    const rows = await db
      .selectFrom("projects")
      .leftJoin("apps", "apps.project_id", "projects.id")
      .select(["projects.id", "projects.slug", "projects.name", "projects.is_private", "apps.state"])
      .where("projects.backing_kind", "=", "app")
      .where("projects.archived_at", "is", null)
      .orderBy("projects.name", "asc")
      .execute();
    return rows.map((row) => ({ projectId: row.id, slug: row.slug, name: row.name, isPrivate: row.is_private, state: row.state ?? "off" }));
  }

  /** The App space an app's host name points at; an archived one can't be opened. */
  findBySlug(slug: string): Promise<AppSpaceRef | null> {
    return this.findWhere("slug", slug, { live: true });
  }

  /** Archived ones too, so their maintainers can still turn the app off. */
  findById(projectId: string): Promise<AppSpaceRef | null> {
    return this.findWhere("id", projectId, { live: false });
  }

  private async findWhere(column: "id" | "slug", value: string, options: { live: boolean }): Promise<AppSpaceRef | null> {
    const row = await db
      .selectFrom("projects")
      .select(["id", "slug", "name", "is_private"])
      .where(column, "=", value)
      .where("backing_kind", "=", "app")
      .$if(options.live, (query) => query.where("archived_at", "is", null))
      .executeTakeFirst();
    return row ? { projectId: row.id, slug: row.slug, name: row.name, isPrivate: row.is_private } : null;
  }
}
