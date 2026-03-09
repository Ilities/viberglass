import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("ticket_phase_document_comments")
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
    .addColumn("line_number", "integer", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) => col.notNull().defaultTo("open"))
    .addColumn("actor", "varchar(255)")
    .addColumn("resolved_at", "timestamptz")
    .addColumn("resolved_by", "varchar(255)")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE ticket_phase_document_comments
    ADD CONSTRAINT ticket_phase_document_comments_phase_check
    CHECK (phase IN ('research', 'planning'))
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_document_comments
    ADD CONSTRAINT ticket_phase_document_comments_line_number_check
    CHECK (line_number > 0)
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_document_comments
    ADD CONSTRAINT ticket_phase_document_comments_status_check
    CHECK (status IN ('open', 'resolved'))
  `.execute(db);

  await db.schema
    .createIndex("idx_ticket_phase_document_comments_ticket_phase_line_created")
    .on("ticket_phase_document_comments")
    .columns(["ticket_id", "phase", "line_number", "created_at"])
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("ticket_phase_document_comments").execute();
}
