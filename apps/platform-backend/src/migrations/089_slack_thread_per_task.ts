import { Kysely, sql } from "kysely";

// A task has one Slack thread, which mirrors its thread in Viberglass. Threads
// no longer belong to an agent's session or remember a step and an agent:
// replies there are messages, answers and asks on the task. Session threads
// are carried over to their task where it has none.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    INSERT INTO chat_ticket_threads (ticket_id, thread_id, channel_id, adapter_name, clanker_id, mode, created_at)
    SELECT DISTINCT ON (s.ticket_id) s.ticket_id, c.thread_id, c.channel_id, c.adapter_name, s.clanker_id, s.mode, c.created_at
    FROM chat_session_threads c
    JOIN agent_sessions s ON s.id = c.session_id
    WHERE NOT EXISTS (SELECT 1 FROM chat_ticket_threads t WHERE t.ticket_id = s.ticket_id OR t.thread_id = c.thread_id)
    ORDER BY s.ticket_id, c.created_at DESC
  `.execute(db);
  await db.schema.dropTable("chat_session_threads").execute();
  await db.schema.alterTable("chat_ticket_threads").dropColumn("clanker_id").dropColumn("mode").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("chat_ticket_threads")
    .addColumn("clanker_id", "uuid")
    .addColumn("mode", "varchar(50)", (col) => col.notNull().defaultTo("research"))
    .execute();
  await sql`
    UPDATE chat_ticket_threads t SET clanker_id = s.clanker_id
    FROM (SELECT DISTINCT ON (ticket_id) ticket_id, clanker_id FROM agent_sessions ORDER BY ticket_id, created_at DESC) s
    WHERE s.ticket_id = t.ticket_id
  `.execute(db);
  await sql`DELETE FROM chat_ticket_threads WHERE clanker_id IS NULL`.execute(db);
  await sql`ALTER TABLE chat_ticket_threads ALTER COLUMN clanker_id SET NOT NULL`.execute(db);
  await db.schema
    .createTable("chat_session_threads")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("session_id", "uuid", (col) => col.notNull().references("agent_sessions.id").onDelete("cascade"))
    .addColumn("thread_id", "varchar(255)", (col) => col.notNull())
    .addColumn("channel_id", "varchar(255)", (col) => col.notNull())
    .addColumn("adapter_name", "varchar(64)", (col) => col.notNull().defaultTo("slack"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_chat_session_threads_session_id").on("chat_session_threads").column("session_id").unique().execute();
  await db.schema.createIndex("idx_chat_session_threads_thread_id").on("chat_session_threads").column("thread_id").unique().execute();
}
