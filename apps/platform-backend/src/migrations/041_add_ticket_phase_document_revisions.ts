import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("ticket_phase_document_revisions")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("document_id", "uuid", (col) =>
      col
        .notNull()
        .references("ticket_phase_documents.id")
        .onDelete("cascade"),
    )
    .addColumn("ticket_id", "uuid", (col) =>
      col.notNull().references("tickets.id").onDelete("cascade"),
    )
    .addColumn("phase", "varchar(20)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("source", "varchar(20)", (col) => col.notNull())
    .addColumn("actor", "varchar(255)")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE ticket_phase_document_revisions
    ADD CONSTRAINT ticket_phase_document_revisions_phase_check
    CHECK (phase IN ('research', 'planning', 'execution'))
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_document_revisions
    ADD CONSTRAINT ticket_phase_document_revisions_source_check
    CHECK (source IN ('manual', 'agent'))
  `.execute(db);

  await db.schema
    .createIndex("idx_ticket_phase_document_revisions_ticket_phase_created")
    .on("ticket_phase_document_revisions")
    .columns(["ticket_id", "phase", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_ticket_phase_document_revisions_document_created")
    .on("ticket_phase_document_revisions")
    .columns(["document_id", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("ticket_phase_document_revisions").execute();
}
