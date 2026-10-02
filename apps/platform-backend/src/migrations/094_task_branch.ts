import { Kysely, sql } from "kysely";

// A task's branch is named once, by its first build or when someone takes the
// work over, and kept: a branch template with {{ jobId }} or {{ timestamp }}
// would otherwise name a new branch every build. Tasks a build already pushed
// keep the branch it pushed.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tickets").addColumn("task_branch", "varchar(255)").execute();
  await sql`
    UPDATE tickets t SET task_branch = latest.branch
    FROM (
      SELECT DISTINCT ON (ticket_id) ticket_id, result->>'branch' AS branch
      FROM jobs
      WHERE job_kind = 'execution' AND status = 'completed' AND result->>'branch' IS NOT NULL
      ORDER BY ticket_id, finished_at DESC NULLS LAST
    ) latest
    WHERE latest.ticket_id = t.id
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tickets").dropColumn("task_branch").execute();
}
