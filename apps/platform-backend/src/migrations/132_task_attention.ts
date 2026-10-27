import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.createTable("task_attention")
    .addColumn("ticket_id", "uuid", (column) => column.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("user_id", "uuid", (column) => column.notNull().references("users.id").onDelete("cascade"))
    .addColumn("source", "text", (column) => column.notNull())
    .addColumn("mode", "varchar(20)", (column) => column.notNull())
    .addColumn("reason", "text")
    .addColumn("remind_at", "timestamptz")
    .addColumn("question_ids", sql`uuid[]`, (column) => column.notNull().defaultTo(sql`'{}'::uuid[]`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("task_attention_pkey", ["ticket_id", "user_id", "source"])
    .execute();
  await db.schema.createIndex("task_attention_user_idx").on("task_attention").columns(["user_id", "ticket_id"]).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("task_attention").execute();
}
