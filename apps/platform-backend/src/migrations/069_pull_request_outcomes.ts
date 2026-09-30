import { Kysely, sql } from "kysely";

/**
 * What happened to each pull request an agent opened — the ground-truth label
 * the eval programme grades against.
 *
 * Keyed by URL rather than job: session turns and re-runs push to the same PR,
 * and the outcome belongs to the PR. Join to `job_run_manifests` on
 * `pull_request_url`.
 *
 * Also backfills a minimal manifest for every job that opened a PR before
 * manifests existed, so those PRs get labelled too.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("pull_request_outcomes")
    .addColumn("pull_request_url", "text", (col) => col.primaryKey())
    .addColumn("state", "text", (col) =>
      col.check(sql`state IS NULL OR state IN ('open', 'closed', 'merged')`),
    )
    .addColumn("merged_at", "timestamptz")
    .addColumn("closed_at", "timestamptz")
    // Conversation comments and inline review comments are separate counts in
    // the GitHub API; reviewer effort shows up in either.
    .addColumn("comment_count", "integer")
    .addColumn("review_comment_count", "integer")
    .addColumn("checked_at", "timestamptz", (col) => col.notNull())
    // Why the last check produced no state. Rows keep their previous state.
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    INSERT INTO job_run_manifests (
      job_id, manifest_version, tenant_id, job_kind, ticket_id, project_id,
      clanker_id, repository, base_branch, dispatched_at, pull_request_url,
      success, started_at, finished_at
    )
    SELECT
      j.id, 1, j.tenant_id, j.job_kind, j.ticket_id, t.project_id::text,
      j.clanker_id, j.repository, j.base_branch, j.created_at,
      j.result->>'pullRequestUrl', j.status = 'completed', j.started_at,
      j.finished_at
    FROM jobs j
    LEFT JOIN tickets t ON t.id = j.ticket_id
    WHERE j.result->>'pullRequestUrl' IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM job_run_manifests m WHERE m.job_id = j.id)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("pull_request_outcomes").execute();
}
