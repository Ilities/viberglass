import { sql } from "kysely";
import type { PreviewOutput } from "@viberglass/types";
import db from "../config/database";
import { before, outputOrder, searchPattern, type OutputCursor, type OutputFilter } from "./outputQuery";

const ORDER = outputOrder("app_previews.created_at", "preview:", "app_previews.id");

/** Changes in a preview that isn't switched off, as Outputs lists them. */
export class PreviewOutputsDAO {
  async list(filter: OutputFilter, cursor: OutputCursor | null, limit: number): Promise<PreviewOutput[]> {
    if (!this.included(filter)) return [];
    let query = this.filtered(filter).select([
      "app_previews.id",
      "app_previews.state",
      "app_previews.created_at",
      "tickets.id as ticket_id",
      "tickets.task_key",
      "tickets.title",
      "projects.id as project_id",
      "projects.slug as project_slug",
      "projects.name as project_name",
    ]);
    if (cursor) query = query.where(before(ORDER, cursor));
    const rows = await query.orderBy(ORDER.at, "desc").orderBy(ORDER.id, "desc").limit(limit).execute();
    return rows.map((row) => ({
      type: "preview",
      kind: "app",
      id: `preview:${row.id}`,
      spaceId: row.project_id,
      spaceSlug: row.project_slug,
      spaceName: row.project_name,
      taskId: row.ticket_id,
      taskKey: row.task_key,
      createdAt: row.created_at.toISOString(),
      previewId: row.id,
      taskTitle: row.title,
      state: row.state,
    }));
  }

  async count(filter: OutputFilter): Promise<number> {
    if (!this.included({ ...filter, kind: undefined })) return 0;
    const row = await this.filtered(filter).select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  private included(filter: OutputFilter): boolean {
    return (!filter.kind || filter.kind === "app") && filter.producer !== "person";
  }

  private filtered(filter: OutputFilter) {
    let query = db
      .selectFrom("app_previews")
      .innerJoin("projects", "projects.id", "app_previews.project_id")
      .innerJoin("tickets", "tickets.id", "app_previews.ticket_id")
      .where("app_previews.state", "!=", "off");
    if (filter.projectIds) query = filter.projectIds.length ? query.where("projects.id", "in", filter.projectIds) : query.where(sql<boolean>`false`);
    if (filter.spaceId) query = query.where("projects.id", "=", filter.spaceId);
    if (filter.q) {
      const pattern = searchPattern(filter.q);
      query = query.where((eb) => eb.or([eb("tickets.title", "ilike", pattern), eb("projects.name", "ilike", pattern)]));
    }
    return query;
  }
}
