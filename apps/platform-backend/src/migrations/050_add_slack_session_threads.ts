import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .createTable("slack_session_threads")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("session_id", "uuid", (col) =>
      col.notNull().references("agent_sessions.id").onDelete("cascade"),
    )
    .addColumn("thread_id", "varchar(255)", (col) => col.notNull())
    .addColumn("channel_id", "varchar(255)", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex("idx_slack_session_threads_session_id")
    .on("slack_session_threads")
    .column("session_id")
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_slack_session_threads_thread_id")
    .on("slack_session_threads")
    .column("thread_id")
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("slack_session_threads").execute();
}
