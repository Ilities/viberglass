import { Kysely, sql } from "kysely";

// The task's Discussion thread and its @mentions (phase-2-3-handover §2.5).
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_messages")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("author_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("body_markdown", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("edited_at", "timestamptz")
    .execute();
  await db.schema.createIndex("task_messages_ticket_idx").on("task_messages").columns(["ticket_id", "created_at"]).execute();

  await db.schema
    .createTable("task_message_mentions")
    .addColumn("message_id", "uuid", (col) => col.notNull().references("task_messages.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (col) => col.notNull().references("users.id").onDelete("cascade"))
    .addPrimaryKeyConstraint("task_message_mentions_pkey", ["message_id", "user_id"])
    .execute();
  await db.schema.createIndex("task_message_mentions_user_idx").on("task_message_mentions").column("user_id").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("task_message_mentions").execute();
  await db.schema.dropTable("task_messages").execute();
}
