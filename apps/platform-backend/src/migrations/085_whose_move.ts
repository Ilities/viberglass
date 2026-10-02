import { Kysely, sql } from "kysely";

// Whose move, Home and unread. Mentions by
// people and by the agent (with an artifact) share one table, open until the
// person mentioned next posts in the thread. task_reads gives unread counts.
// The Inbox page goes, so its notifications table does too;
// Slack and email never read it.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_mentions")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("message_id", "uuid", (col) => col.references("task_messages.id").onDelete("cascade"))
    .addColumn("agent_turn_id", "uuid", (col) => col.references("agent_turns.id").onDelete("cascade"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("answered_at", "timestamptz")
    .addCheckConstraint("task_mentions_one_source", sql`(message_id IS NULL) <> (agent_turn_id IS NULL)`)
    .execute();
  await db.schema.createIndex("task_mentions_ticket_idx").on("task_mentions").columns(["ticket_id", "answered_at"]).execute();
  await db.schema.createIndex("task_mentions_user_idx").on("task_mentions").columns(["user_id", "answered_at"]).execute();

  // Earlier mentions are answered if the person has posted in the thread since.
  await sql`
    INSERT INTO task_mentions (ticket_id, user_id, message_id, created_at, answered_at)
    SELECT m.ticket_id, mm.user_id, m.id, m.created_at, (
      SELECT min(reply.created_at) FROM task_messages reply
      WHERE reply.ticket_id = m.ticket_id AND reply.author_id = mm.user_id AND reply.created_at > m.created_at
    )
    FROM task_message_mentions mm
    JOIN task_messages m ON m.id = mm.message_id
  `.execute(db);
  await db.schema.dropTable("task_message_mentions").execute();

  await db.schema
    .createTable("task_reads")
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("last_read_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("task_reads_pkey", ["ticket_id", "user_id"])
    .execute();

  await db.schema.dropTable("notifications").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("notifications")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("recipient_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addColumn("kind", "varchar(40)", (col) => col.notNull())
    .addColumn("ticket_id", "uuid", (col) => col.references("tickets.id").onDelete("cascade"))
    .addColumn("actor_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("payload_json", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("read_at", "timestamptz")
    .addColumn("done_at", "timestamptz")
    .addColumn("snoozed_until", "timestamptz")
    .execute();
  await db.schema.dropTable("task_reads").execute();

  await db.schema
    .createTable("task_message_mentions")
    .addColumn("message_id", "uuid", (col) => col.notNull().references("task_messages.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addPrimaryKeyConstraint("task_message_mentions_pkey", ["message_id", "user_id"])
    .execute();
  await sql`
    INSERT INTO task_message_mentions (message_id, user_id)
    SELECT message_id, user_id FROM task_mentions WHERE message_id IS NOT NULL
  `.execute(db);
  await db.schema.dropTable("task_mentions").execute();
}
