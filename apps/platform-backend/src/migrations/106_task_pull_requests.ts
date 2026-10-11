import { Kysely, sql } from "kysely";

/**
 * A task's pull requests, one per build of a part of its plan, each on its own
 * branch, instead of one branch and one pull request on the task. A task's
 * branch and pull request so far become its first row, covering the whole plan.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_pull_requests")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("branch", "varchar(255)", (col) => col.notNull())
    .addColumn("url", "text")
    .addColumn("first_part", "integer", (col) => col.notNull().defaultTo(1))
    // Null: through the plan's last part.
    .addColumn("last_part", "integer")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("task_pull_requests_ticket_branch_unique", ["ticket_id", "branch"])
    .execute();
  await db.schema.createIndex("idx_task_pull_requests_ticket").on("task_pull_requests").columns(["ticket_id", "created_at"]).execute();
  await db.schema.createIndex("idx_task_pull_requests_url").on("task_pull_requests").column("url").execute();

  // A pull request from before tasks had a branch takes the branch its run pushed.
  await sql`
    INSERT INTO task_pull_requests (ticket_id, branch, url, created_at, updated_at)
    SELECT t.id,
           COALESCE(
             t.task_branch,
             (SELECT m.branch FROM job_run_manifests m WHERE m.pull_request_url = t.pull_request_url AND m.branch IS NOT NULL LIMIT 1),
             'viberator/' || t.id
           ),
           t.pull_request_url,
           t.created_at,
           t.updated_at
    FROM tickets t
    WHERE t.task_branch IS NOT NULL OR t.pull_request_url IS NOT NULL
  `.execute(db);

  await db.schema.alterTable("tickets").dropColumn("pull_request_url").dropColumn("task_branch").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tickets").addColumn("pull_request_url", "text").addColumn("task_branch", "varchar(255)").execute();
  await sql`
    UPDATE tickets t SET task_branch = p.branch, pull_request_url = p.url
    FROM (
      SELECT DISTINCT ON (ticket_id) ticket_id, branch, url FROM task_pull_requests ORDER BY ticket_id, created_at DESC
    ) p
    WHERE p.ticket_id = t.id
  `.execute(db);
  await db.schema.dropTable("task_pull_requests").execute();
}
