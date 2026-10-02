import { Kysely, sql } from "kysely";

// Approval policy: approvals name a user rather than
// an email, and each space has default reviewers for its new tasks. An
// approver recorded as an email nobody has any more becomes null.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE ticket_phase_documents d
    SET approved_by = (
      SELECT u.id::text FROM users u WHERE u.id::text = d.approved_by OR lower(u.email) = lower(d.approved_by) LIMIT 1
    )
    WHERE d.approved_by IS NOT NULL
  `.execute(db);
  await sql`ALTER TABLE ticket_phase_documents ALTER COLUMN approved_by TYPE uuid USING approved_by::uuid`.execute(db);
  await sql`
    ALTER TABLE ticket_phase_documents
    ADD CONSTRAINT ticket_phase_documents_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES users(id) ON DELETE SET NULL
  `.execute(db);

  await db.schema
    .alterTable("ticket_phase_approvals")
    .addColumn("actor_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .execute();
  await sql`
    UPDATE ticket_phase_approvals a
    SET actor_id = (
      SELECT u.id FROM users u WHERE u.id::text = a.actor OR lower(u.email) = lower(a.actor) LIMIT 1
    )
    WHERE a.actor IS NOT NULL
  `.execute(db);
  await db.schema.alterTable("ticket_phase_approvals").dropColumn("actor").execute();

  await db.schema
    .alterTable("projects")
    .addColumn("default_reviewer_ids", sql`uuid[]`, (col) => col.notNull().defaultTo(sql`'{}'::uuid[]`))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("projects").dropColumn("default_reviewer_ids").execute();

  await db.schema.alterTable("ticket_phase_approvals").addColumn("actor", "varchar(255)").execute();
  await sql`UPDATE ticket_phase_approvals SET actor = actor_id::text`.execute(db);
  await db.schema.alterTable("ticket_phase_approvals").dropColumn("actor_id").execute();

  await sql`ALTER TABLE ticket_phase_documents DROP CONSTRAINT ticket_phase_documents_approved_by_fkey`.execute(db);
  await sql`ALTER TABLE ticket_phase_documents ALTER COLUMN approved_by TYPE varchar(255) USING approved_by::text`.execute(db);
}
