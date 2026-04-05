import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("chat_ticket_threads")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("ticket_id", "uuid", (col) =>
      col.notNull().references("tickets.id").onDelete("cascade"),
    )
    .addColumn("thread_id", "varchar(255)", (col) => col.notNull())
    .addColumn("channel_id", "varchar(255)", (col) => col.notNull())
    .addColumn("adapter_name", "varchar(50)", (col) => col.notNull())
    .addColumn("clanker_id", "uuid", (col) => col.notNull())
    .addColumn("mode", "varchar(50)", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_chat_ticket_threads_ticket_id")
    .on("chat_ticket_threads")
    .column("ticket_id")
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_chat_ticket_threads_thread_id")
    .on("chat_ticket_threads")
    .column("thread_id")
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("chat_ticket_threads").execute();
}
