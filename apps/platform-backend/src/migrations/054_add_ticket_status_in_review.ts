import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop existing constraint, add new one with in_review
  await sql`
    ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_ticket_status_check
  `.execute(db);

  await sql`
    ALTER TABLE tickets
    ADD CONSTRAINT tickets_ticket_status_check
    CHECK (ticket_status IN ('open', 'in_progress', 'in_review', 'resolved'))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`
    ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_ticket_status_check
  `.execute(db);

  // Migrate any in_review tickets back to in_progress before restoring old constraint
  await sql`
    UPDATE tickets SET ticket_status = 'in_progress' WHERE ticket_status = 'in_review'
  `.execute(db);

  await sql`
    ALTER TABLE tickets
    ADD CONSTRAINT tickets_ticket_status_check
    CHECK (ticket_status IN ('open', 'in_progress', 'resolved'))
  `.execute(db);
}
