import type { Selectable } from "kysely";
import db from "../config/database";
import type {
  JobLogLinesTable,
  JobRunManifestsTable,
  PullRequestOutcomesTable,
} from "../types/database";

export type ManifestRow = Selectable<JobRunManifestsTable>;
export type PullRequestOutcomeRow = Selectable<PullRequestOutcomesTable>;
export type LogLineRow = Pick<Selectable<JobLogLinesTable>, "created_at" | "level" | "source" | "message">;

export interface ManifestExportFilter {
  since?: Date;
  until?: Date;
}

/** Position after the last row of a page, in dispatch order. */
export interface ManifestCursor {
  dispatchedAt: Date;
  jobId: string;
}

/** Reads run manifests in dispatch order, with what the eval corpus joins to them. */
export class RunManifestExportDAO {
  async listPage(
    filter: ManifestExportFilter,
    after: ManifestCursor | null,
    limit: number,
  ): Promise<ManifestRow[]> {
    let query = db.selectFrom("job_run_manifests").selectAll();
    if (filter.since) query = query.where("dispatched_at", ">=", filter.since);
    if (filter.until) query = query.where("dispatched_at", "<", filter.until);
    if (after) {
      query = query.where((eb) =>
        eb(eb.refTuple("dispatched_at", "job_id"), ">", eb.tuple(after.dispatchedAt, after.jobId)),
      );
    }

    return query.orderBy("dispatched_at").orderBy("job_id").limit(limit).execute();
  }

  async listOutcomes(pullRequestUrls: string[]): Promise<PullRequestOutcomeRow[]> {
    if (pullRequestUrls.length === 0) return [];
    return db
      .selectFrom("pull_request_outcomes")
      .selectAll()
      .where("pull_request_url", "in", pullRequestUrls)
      .execute();
  }

  async listLogLines(jobId: string): Promise<LogLineRow[]> {
    return db
      .selectFrom("job_log_lines")
      .select(["created_at", "level", "source", "message"])
      .where("job_id", "=", jobId)
      .orderBy("created_at")
      .execute();
  }
}
