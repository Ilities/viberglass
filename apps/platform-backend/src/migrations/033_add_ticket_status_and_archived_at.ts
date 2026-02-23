import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("tickets")
    .addColumn("ticket_status", "varchar(20)", (col) =>
      col.notNull().defaultTo("open"),
    )
    .addColumn("archived_at", "timestamp")
    .execute();

  await sql`
    UPDATE tickets
    SET ticket_status = CASE
      WHEN external_ticket_id IS NOT NULL OR auto_fix_status = 'completed' THEN 'resolved'
      WHEN auto_fix_status = 'in_progress' THEN 'in_progress'
      ELSE 'open'
    END
  `.execute(db);

  await sql`
    ALTER TABLE tickets
    ADD CONSTRAINT tickets_ticket_status_check
    CHECK (ticket_status IN ('open', 'in_progress', 'resolved'))
  `.execute(db);

  await db.schema
    .createIndex("idx_tickets_project_archived_status_created")
    .on("tickets")
    .columns(["project_id", "archived_at", "ticket_status", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_tickets_archived_created")
    .on("tickets")
    .columns(["archived_at", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropIndex("idx_tickets_project_archived_status_created").execute();
  await db.schema.dropIndex("idx_tickets_archived_created").execute();

  await sql`
    ALTER TABLE tickets
    DROP CONSTRAINT IF EXISTS tickets_ticket_status_check
  `.execute(db);

  await db.schema
    .alterTable("tickets")
    .dropColumn("ticket_status")
    .dropColumn("archived_at")
    .execute();
}
