import { Kysely, sql } from "kysely";

// Done on merge (task-conversation-handover S5). Merged outcomes are final and
// never checked again, so tasks whose pull request merged before the sweeper
// closed tasks are closed here, each with its quiet line.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    WITH merged AS (
      UPDATE tickets t
      SET ticket_status = 'resolved', updated_at = now()
      FROM pull_request_outcomes o
      WHERE o.pull_request_url = t.pull_request_url AND o.state = 'merged' AND t.ticket_status <> 'resolved'
      RETURNING t.id, t.pull_request_url, o.merged_at
    )
    INSERT INTO task_activity (ticket_id, actor_type, kind, payload_json, created_at)
    SELECT id, 'system', 'pull_request_merged', jsonb_build_object('pullRequestUrl', pull_request_url, 'merged', true), coalesce(merged_at, now())
    FROM merged
  `.execute(db);
}

export async function down(): Promise<void> {
  // Closing tasks is not undone: they were done.
}
