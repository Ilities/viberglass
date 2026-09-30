import type { PullRequestOutcome } from "../../services/pull-request-outcomes/pullRequestOutcomeTypes";
import db from "../config/database";

export interface PullRequestDueForCheck {
  pullRequestUrl: string;
  projectId: string | null;
}

/**
 * Outcome labels for the PRs recorded in `job_run_manifests`.
 *
 * Merged and closed are final: a PR is not checked again once it reaches
 * either. A reopened PR therefore keeps its closed label.
 */
export class PullRequestOutcomeDAO {
  /**
   * PRs never checked, then open or failed checks last seen before
   * `recheckBefore`, oldest check first.
   */
  async listDueForCheck(recheckBefore: Date, limit: number): Promise<PullRequestDueForCheck[]> {
    const rows = await db
      .selectFrom("job_run_manifests as m")
      .leftJoin("pull_request_outcomes as o", "o.pull_request_url", "m.pull_request_url")
      .select((eb) => [
        "m.pull_request_url",
        eb.fn.max("m.project_id").as("project_id"),
        eb.fn.max("o.checked_at").as("checked_at"),
      ])
      .where("m.pull_request_url", "is not", null)
      .where((eb) =>
        eb.or([
          eb("o.pull_request_url", "is", null),
          eb.and([
            eb.or([eb("o.state", "is", null), eb("o.state", "=", "open")]),
            eb("o.checked_at", "<", recheckBefore),
          ]),
        ]),
      )
      .groupBy("m.pull_request_url")
      .orderBy("checked_at", (ob) => ob.asc().nullsFirst())
      .limit(limit)
      .execute();

    return rows.flatMap((row) =>
      row.pull_request_url
        ? [{ pullRequestUrl: row.pull_request_url, projectId: row.project_id }]
        : [],
    );
  }

  async recordOutcome(pullRequestUrl: string, outcome: PullRequestOutcome): Promise<void> {
    const values = {
      state: outcome.state,
      merged_at: outcome.mergedAt,
      closed_at: outcome.closedAt,
      comment_count: outcome.commentCount,
      review_comment_count: outcome.reviewCommentCount,
      checked_at: new Date(),
      last_error: null,
      updated_at: new Date(),
    };

    await db
      .insertInto("pull_request_outcomes")
      .values({ pull_request_url: pullRequestUrl, ...values })
      .onConflict((oc) => oc.column("pull_request_url").doUpdateSet(values))
      .execute();
  }

  /** Records a failed check without discarding a state already known. */
  async recordError(pullRequestUrl: string, error: string): Promise<void> {
    const values = { checked_at: new Date(), last_error: error, updated_at: new Date() };

    await db
      .insertInto("pull_request_outcomes")
      .values({ pull_request_url: pullRequestUrl, state: null, ...values })
      .onConflict((oc) => oc.column("pull_request_url").doUpdateSet(values))
      .execute();
  }
}
