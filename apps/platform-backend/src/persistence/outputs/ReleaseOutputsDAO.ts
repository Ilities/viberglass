import { sql } from "kysely";
import type { OutputReleaseStatus, ReleaseOutput } from "@viberglass/types";
import db from "../config/database";
import { before, outputOrder, searchPattern, type OutputCursor, type OutputFilter } from "./outputQuery";

const ORDER = outputOrder("app_releases.created_at", "release:", "app_releases.id");

/** An app's releases from its default branch, as Outputs lists them. Agents make them, so a person filter leaves them out. */
export class ReleaseOutputsDAO {
  async list(filter: OutputFilter, cursor: OutputCursor | null, limit: number): Promise<Omit<ReleaseOutput, "appUrl">[]> {
    if (!this.included(filter)) return [];
    let query = this.filtered(filter)
      .leftJoin("tickets", "tickets.id", "app_releases.ticket_id")
      .select([
        "app_releases.id",
        "app_releases.commit_sha",
        "app_releases.status",
        "app_releases.went_live_at",
        "app_releases.rolled_back_at",
        "app_releases.created_at",
        "app_releases.ticket_id",
        "apps.current_release_id",
        "tickets.task_key",
        "projects.id as project_id",
        "projects.slug as project_slug",
        "projects.name as project_name",
      ]);
    if (cursor) query = query.where(before(ORDER, cursor));
    const rows = await query.orderBy(ORDER.at, "desc").orderBy(ORDER.id, "desc").limit(limit).execute();
    return rows.map((row) => ({
      type: "release",
      kind: "app",
      id: `release:${row.id}`,
      spaceId: row.project_id,
      spaceSlug: row.project_slug,
      spaceName: row.project_name,
      taskId: row.ticket_id,
      taskKey: row.task_key,
      createdAt: row.created_at.toISOString(),
      releaseId: row.id,
      commitSha: row.commit_sha,
      status: releaseStatusOf(row),
    }));
  }

  async count(filter: OutputFilter): Promise<number> {
    if (!this.included({ ...filter, kind: undefined })) return 0;
    const row = await this.filtered(filter).select((eb) => eb.fn.countAll<string>().as("count")).executeTakeFirst();
    return Number(row?.count ?? 0);
  }

  /** Releases built since then, per space, and how many of them went live. */
  async madeSince(projectIds: string[] | null, since: Date): Promise<Array<{ projectId: string; count: number; live: number }>> {
    let query = db
      .selectFrom("app_releases")
      .select("project_id")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .select(sql<string>`count(went_live_at)`.as("live"))
      .where("preview", "=", false)
      .where("created_at", ">", since)
      .groupBy("project_id");
    if (projectIds) query = projectIds.length ? query.where("project_id", "in", projectIds) : query.where(sql<boolean>`false`);
    return (await query.execute()).map((row) => ({ projectId: row.project_id, count: Number(row.count), live: Number(row.live) }));
  }

  private included(filter: OutputFilter): boolean {
    return (!filter.kind || filter.kind === "app") && filter.producer !== "person";
  }

  private filtered(filter: OutputFilter) {
    let query = db
      .selectFrom("app_releases")
      .innerJoin("projects", "projects.id", "app_releases.project_id")
      .leftJoin("apps", "apps.project_id", "app_releases.project_id")
      .where("app_releases.preview", "=", false);
    if (filter.projectIds) query = filter.projectIds.length ? query.where("projects.id", "in", filter.projectIds) : query.where(sql<boolean>`false`);
    if (filter.spaceId) query = query.where("projects.id", "=", filter.spaceId);
    if (filter.latest) {
      query = query.where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("app_releases as newer")
              .select("newer.id")
              .whereRef("newer.project_id", "=", "app_releases.project_id")
              .where("newer.preview", "=", false)
              .whereRef("newer.created_at", ">", "app_releases.created_at"),
          ),
        ),
      );
    }
    if (filter.q) query = query.where("projects.name", "ilike", searchPattern(filter.q));
    return query;
  }
}

/** Where a release stands next to the app's current one. */
export function releaseStatusOf(row: {
  id: string;
  status: "building" | "ready" | "failed";
  went_live_at: Date | null;
  rolled_back_at: Date | null;
  current_release_id: string | null;
}): OutputReleaseStatus {
  if (row.current_release_id === row.id) return "live";
  if (row.status !== "ready") return row.status;
  if (row.rolled_back_at) return "rolled_back";
  return row.went_live_at ? "was_live" : "ready";
}
