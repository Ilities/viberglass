import { Kysely, sql } from "kysely";

// Append-only history of a task (phase-2-3-handover §2.5): who did what, when.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_activity")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("actor_type", "varchar(10)", (col) => col.notNull().check(sql`actor_type IN ('human', 'agent', 'system')`))
    .addColumn("actor_id", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("kind", "varchar(40)", (col) => col.notNull())
    .addColumn("payload_json", "jsonb", (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("task_activity_ticket_idx").on("task_activity").columns(["ticket_id", "created_at"]).execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("task_activity").execute();
}
