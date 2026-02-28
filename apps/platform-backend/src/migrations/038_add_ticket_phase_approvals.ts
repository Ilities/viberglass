import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Add approval state column to ticket_phase_documents
  await db.schema
    .alterTable("ticket_phase_documents")
    .addColumn("approval_state", "varchar(20)", (col) =>
      col.notNull().defaultTo("draft"),
    )
    .execute();

  await sql`
    ALTER TABLE ticket_phase_documents
    ADD CONSTRAINT ticket_phase_documents_approval_state_check
    CHECK (approval_state IN ('draft', 'approval_requested', 'approved', 'rejected'))
  `.execute(db);

  // Add approval audit fields to ticket_phase_documents
  await db.schema
    .alterTable("ticket_phase_documents")
    .addColumn("approved_at", "timestamptz")
    .execute();

  await db.schema
    .alterTable("ticket_phase_documents")
    .addColumn("approved_by", "varchar(255)")
    .execute();

  // Create ticket_phase_approvals table for approval history
  await db.schema
    .createTable("ticket_phase_approvals")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("ticket_id", "uuid", (col) =>
      col.notNull().references("tickets.id").onDelete("cascade"),
    )
    .addColumn("phase", "varchar(20)", (col) => col.notNull())
    .addColumn("action", "varchar(20)", (col) => col.notNull())
    .addColumn("actor", "varchar(255)")
    .addColumn("comment", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE ticket_phase_approvals
    ADD CONSTRAINT ticket_phase_approvals_action_check
    CHECK (action IN ('approval_requested', 'approved', 'rejected', 'revoked'))
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_approvals
    ADD CONSTRAINT ticket_phase_approvals_phase_check
    CHECK (phase IN ('research', 'planning', 'execution'))
  `.execute(db);

  // Create index for efficient lookups
  await db.schema
    .createIndex("idx_ticket_phase_approvals_ticket_phase")
    .on("ticket_phase_approvals")
    .columns(["ticket_id", "phase", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("ticket_phase_approvals").execute();

  await db.schema
    .alterTable("ticket_phase_documents")
    .dropColumn("approval_state")
    .execute();

  await db.schema
    .alterTable("ticket_phase_documents")
    .dropColumn("approved_at")
    .execute();

  await db.schema
    .alterTable("ticket_phase_documents")
    .dropColumn("approved_by")
    .execute();
}
