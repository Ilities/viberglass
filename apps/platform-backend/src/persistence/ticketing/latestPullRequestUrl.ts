import { sql, type RawBuilder } from "kysely";

/** A task's latest pull request, as a column of a select on `tickets` under `alias`. */
export function latestPullRequestUrl(alias: string): RawBuilder<string | null> {
  return sql<string | null>`(
    SELECT p.url FROM task_pull_requests p
    WHERE p.ticket_id = ${sql.ref(`${alias}.id`)} AND p.url IS NOT NULL
    ORDER BY p.created_at DESC LIMIT 1
  )`;
}
