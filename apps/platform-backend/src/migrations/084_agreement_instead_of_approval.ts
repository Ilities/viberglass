import { Kysely, sql } from "kysely";

// Agreement instead of approval.
// Approvals stop gating anything: every approval on record becomes a quiet
// line in its task's thread, the approval state and the "skip to the build"
// override go, and a task's phase is re-derived from what exists.
export async function up(db: Kysely<any>): Promise<void> {
  // Approvals given before Activity existed (or outside it) get their line; the window absorbs the two writes' gap.
  await sql`
    INSERT INTO task_activity (ticket_id, actor_type, actor_id, kind, payload_json, created_at)
    SELECT a.ticket_id,
           CASE WHEN a.actor_id IS NULL THEN 'system' ELSE 'human' END,
           a.actor_id,
           'document_approved',
           jsonb_build_object('step', a.phase),
           a.created_at
    FROM ticket_phase_approvals a
    WHERE a.action = 'approved'
      AND NOT EXISTS (
        SELECT 1 FROM task_activity t
        WHERE t.ticket_id = a.ticket_id
          AND t.kind = 'document_approved'
          AND t.payload_json->>'step' = a.phase
          AND t.created_at BETWEEN a.created_at - interval '1 minute' AND a.created_at + interval '1 minute'
      )
  `.execute(db);
  await db.schema.dropTable("ticket_phase_approvals").execute();

  await sql`ALTER TABLE ticket_phase_documents DROP CONSTRAINT IF EXISTS ticket_phase_documents_approved_by_fkey`.execute(db);
  await sql`ALTER TABLE ticket_phase_documents DROP CONSTRAINT IF EXISTS ticket_phase_documents_approval_state_check`.execute(db);
  await db.schema
    .alterTable("ticket_phase_documents")
    .dropColumn("approval_state")
    .dropColumn("approved_at")
    .dropColumn("approved_by")
    .execute();

  await db.schema
    .alterTable("tickets")
    .dropColumn("workflow_override_reason")
    .dropColumn("workflow_overridden_at")
    .dropColumn("workflow_overridden_by")
    .execute();

  // The furthest artifact: the build once there's a pull request, the plan once one is written, else research.
  await sql`
    UPDATE tickets t
    SET workflow_phase = CASE
      WHEN t.pull_request_url IS NOT NULL AND t.pull_request_url <> '' THEN 'execution'
      WHEN EXISTS (
        SELECT 1 FROM ticket_phase_documents d
        WHERE d.ticket_id = t.id AND d.phase = 'planning' AND btrim(d.content) <> ''
      ) THEN 'planning'
      ELSE 'research'
    END
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("tickets")
    .addColumn("workflow_override_reason", "text")
    .addColumn("workflow_overridden_at", "timestamptz")
    .addColumn("workflow_overridden_by", "varchar(255)")
    .execute();

  await db.schema
    .alterTable("ticket_phase_documents")
    .addColumn("approval_state", "varchar(20)", (col) => col.notNull().defaultTo("draft"))
    .addColumn("approved_at", "timestamptz")
    .addColumn("approved_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .execute();
  await sql`
    ALTER TABLE ticket_phase_documents
    ADD CONSTRAINT ticket_phase_documents_approval_state_check
    CHECK (approval_state IN ('draft', 'approval_requested', 'approved', 'rejected'))
  `.execute(db);

  await db.schema
    .createTable("ticket_phase_approvals")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("phase", "varchar(20)", (col) => col.notNull())
    .addColumn("action", "varchar(20)", (col) => col.notNull())
    .addColumn("actor_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("comment", "text")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}
