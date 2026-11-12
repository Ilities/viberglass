import type { PullRequestOutcome, RecordedPullRequest } from "@viberglass/types";
import { sql } from "kysely";
import db from "../config/database";

/** When an open PR is due again: a PR first seen after `recentSince` once checked before `recentBefore`, an older one before `olderBefore`. */
export interface RecheckWindows {
  recentSince: Date;
  recentBefore: Date;
  olderBefore: Date;
}

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
  /** PRs never checked, then open or failed checks due again, oldest check first. */
  async listDueForCheck(windows: RecheckWindows, limit: number): Promise<PullRequestDueForCheck[]> {
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
            eb.or([
              eb.and([eb("o.created_at", ">=", windows.recentSince), eb("o.checked_at", "<", windows.recentBefore)]),
              eb.and([eb("o.created_at", "<", windows.recentSince), eb("o.checked_at", "<", windows.olderBefore)]),
            ]),
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

  /** What was last recorded about these pull requests, by URL, with who merged each when its task recorded that. */
  async recordedFor(pullRequestUrls: string[]): Promise<Map<string, RecordedPullRequest>> {
    if (pullRequestUrls.length === 0) return new Map();
    const rows = await db
      .selectFrom("pull_request_outcomes as o")
      .select((eb) => [
        "o.pull_request_url",
        "o.state",
        "o.merged_at",
        "o.closed_at",
        "o.comment_count",
        "o.review_comment_count",
        "o.checked_at",
        eb
          .selectFrom("task_activity as a")
          .select(sql<string | null>`a.payload_json->>'mergedBy'`.as("merged_by"))
          .where("a.kind", "=", "pull_request_merged")
          .where(sql<string>`a.payload_json->>'pullRequestUrl'`, "=", eb.ref("o.pull_request_url"))
          .orderBy("a.created_at", "desc")
          .limit(1)
          .as("merged_by"),
      ])
      .where("o.pull_request_url", "in", pullRequestUrls)
      .execute();
    return new Map(rows.map((row) => [row.pull_request_url, {
      state: row.state,
      mergedAt: row.merged_at?.toISOString() ?? null,
      closedAt: row.closed_at?.toISOString() ?? null,
      mergedBy: row.merged_by ?? null,
      commentCount: row.comment_count,
      reviewCommentCount: row.review_comment_count,
      checkedAt: row.checked_at.toISOString(),
    }]));
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
