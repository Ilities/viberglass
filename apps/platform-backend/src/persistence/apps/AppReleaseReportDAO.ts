import type { AppRelease } from "@viberglass/types";
import db from "../config/database";
import { toRelease } from "./appReleaseRow";

/** Which tasks still need telling how the release of their change ended. */
export class AppReleaseReportDAO {
  /** Releases of tasks' changes whose task hasn't heard how they ended. */
  async listUnreported(): Promise<AppRelease[]> {
    const rows = await db
      .selectFrom("app_releases")
      .selectAll()
      .where("ticket_id", "is not", null)
      .where("reported_at", "is", null)
      .orderBy("created_at", "asc")
      .execute();
    return rows.map(toRelease);
  }

  /** The first release newer than this one to go live, which serves its change too. */
  async laterLive(release: Pick<AppRelease, "projectId" | "createdAt">): Promise<AppRelease | null> {
    const row = await db
      .selectFrom("app_releases")
      .selectAll()
      .where("project_id", "=", release.projectId)
      .where("created_at", ">", new Date(release.createdAt))
      .where("went_live_at", "is not", null)
      .orderBy("went_live_at", "asc")
      .limit(1)
      .executeTakeFirst();
    return row ? toRelease(row) : null;
  }

  /** Returns whether this call was the one to mark it, so a task hears once. */
  async markReported(releaseId: string): Promise<boolean> {
    const result = await db
      .updateTable("app_releases")
      .set({ reported_at: new Date() })
      .where("id", "=", releaseId)
      .where("reported_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }
}
