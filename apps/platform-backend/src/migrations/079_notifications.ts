import { Kysely, sql } from "kysely";

// The Inbox (phase-2-3-handover §2.6): one row per person per thing that
// needs them, plus the Slack account each person has linked for DMs.
export async function up(db: Kysely<any>): Promise<void> {
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
  // The Inbox reads one person's open items, newest first.
  await db.schema
    .createIndex("notifications_recipient_open_idx")
    .on("notifications")
    .columns(["recipient_id", "done_at", "created_at"])
    .execute();

  await db.schema.alterTable("users").addColumn("slack_user_id", "varchar(32)").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("users").dropColumn("slack_user_id").execute();
  await db.schema.dropTable("notifications").execute();
}
