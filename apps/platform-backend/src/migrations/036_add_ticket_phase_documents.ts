import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("ticket_phase_documents")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("ticket_id", "uuid", (col) =>
      col.notNull().references("tickets.id").onDelete("cascade"),
    )
    .addColumn("phase", "varchar(20)", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("storage_url", "text")
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE ticket_phase_documents
    ADD CONSTRAINT ticket_phase_documents_phase_check
    CHECK (phase IN ('research', 'planning', 'execution'))
  `.execute(db);

  await db.schema
    .createIndex("idx_ticket_phase_documents_ticket_phase")
    .on("ticket_phase_documents")
    .columns(["ticket_id", "phase"])
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("ticket_phase_documents").execute();
}
