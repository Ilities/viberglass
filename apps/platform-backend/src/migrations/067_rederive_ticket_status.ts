import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Re-derives every unresolved ticket's status with the rules in
 * TicketLifecycleStatusService.
 *
 * Tickets used to be marked in progress whenever their phase document had
 * content, and in later phases even without one, so many say "in progress"
 * while nothing runs. Now: in progress only while a run is queued or active,
 * in review while a document or pull request waits on a human, open otherwise.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    UPDATE tickets AS t
    SET ticket_status = CASE
      WHEN EXISTS (
        SELECT 1 FROM jobs
        WHERE jobs.ticket_id = t.id AND jobs.status IN ('queued', 'active')
      ) THEN 'in_progress'
      WHEN t.workflow_phase = 'execution' THEN
        CASE WHEN t.pull_request_url IS NOT NULL THEN 'in_review' ELSE 'open' END
      WHEN EXISTS (
        SELECT 1 FROM ticket_phase_documents AS d
        WHERE d.ticket_id = t.id
          AND d.phase = t.workflow_phase
          AND d.approval_state <> 'approved'
          AND btrim(d.content) <> ''
      ) THEN 'in_review'
      ELSE 'open'
    END
    WHERE t.ticket_status <> 'resolved'
  `.execute(db);
}

export async function down(): Promise<void> {
  // Irreversible by design: the old statuses were the inaccurate ones.
}
