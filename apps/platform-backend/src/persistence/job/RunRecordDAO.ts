import type { Selectable } from "kysely";
import db from "../config/database";
import type { JobRunManifestsTable, PullRequestOutcomesTable } from "../types/database";
import type { ManifestCursor } from "./RunManifestExportDAO";

type OutcomeRow = Selectable<PullRequestOutcomesTable>;

/** A manifest with its PR outcome and the names needed to link to the run. */
export type RunRecordRow = Selectable<JobRunManifestsTable> & {
  project_slug: string | null;
  ticket_title: string | null;
  clanker_name: string | null;
  clanker_slug: string | null;
  pr_state: OutcomeRow["state"] | null;
  pr_merged_at: OutcomeRow["merged_at"] | null;
  pr_closed_at: OutcomeRow["closed_at"] | null;
  pr_comment_count: number | null;
  pr_review_comment_count: number | null;
  pr_checked_at: OutcomeRow["checked_at"] | null;
  pr_last_error: string | null;
};

/** Run records newest first, for inspecting the corpus one run at a time. */
export class RunRecordDAO {
  async listPage(before: ManifestCursor | null, limit: number): Promise<RunRecordRow[]> {
    let query = this.baseQuery();
    if (before) {
      query = query.where((eb) =>
        eb(eb.refTuple("m.dispatched_at", "m.job_id"), "<", eb.tuple(before.dispatchedAt, before.jobId)),
      );
    }
    return query.orderBy("m.dispatched_at", "desc").orderBy("m.job_id", "desc").limit(limit).execute();
  }

  async getByJobId(jobId: string): Promise<RunRecordRow | undefined> {
    return this.baseQuery().where("m.job_id", "=", jobId).executeTakeFirst();
  }

  private baseQuery() {
    return db
      .selectFrom("job_run_manifests as m")
      .leftJoin("pull_request_outcomes as o", "o.pull_request_url", "m.pull_request_url")
      // Manifest ids are text; project, ticket and clanker ids are uuids.
      .leftJoin("projects as p", (join) => join.on((eb) => eb(eb.cast("p.id", "text"), "=", eb.ref("m.project_id"))))
      .leftJoin("tickets as t", (join) => join.on((eb) => eb(eb.cast("t.id", "text"), "=", eb.ref("m.ticket_id"))))
      .leftJoin("clankers as c", (join) => join.on((eb) => eb(eb.cast("c.id", "text"), "=", eb.ref("m.clanker_id"))))
      .selectAll("m")
      .select([
        "p.slug as project_slug",
        "t.title as ticket_title",
        "c.name as clanker_name",
        "c.slug as clanker_slug",
        "o.state as pr_state",
        "o.merged_at as pr_merged_at",
        "o.closed_at as pr_closed_at",
        "o.comment_count as pr_comment_count",
        "o.review_comment_count as pr_review_comment_count",
        "o.checked_at as pr_checked_at",
        "o.last_error as pr_last_error",
      ]);
  }
}
