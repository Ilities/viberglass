import { sql, type Kysely } from "kysely";

// A comparison runs one task with several runners side by side. Each runner
// gets a task of its own (an arm), forked from the original at one moment:
// the thread, plan and summary up to then, and the code at `base_commit` on
// `base_branch`. The original keeps pointing at the arm picked as the winner.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("task_comparisons")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("parent_ticket_id", "uuid", (col) => col.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("forked_from_turn_id", "uuid", (col) => col.references("agent_turns.id").onDelete("set null"))
    .addColumn("forked_at", "timestamptz", (col) => col.notNull())
    .addColumn("base_branch", "text")
    .addColumn("base_commit", "text")
    .addColumn("winner_ticket_id", "uuid", (col) => col.references("tickets.id").onDelete("set null"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_task_comparisons_parent").on("task_comparisons").columns(["parent_ticket_id", "created_at"]).execute();

  await db.schema
    .createTable("task_comparison_arms")
    .addColumn("ticket_id", "uuid", (col) => col.primaryKey().references("tickets.id").onDelete("cascade"))
    .addColumn("comparison_id", "uuid", (col) => col.notNull().references("task_comparisons.id").onDelete("cascade"))
    .addColumn("clanker_id", "uuid", (col) => col.notNull().references("clankers.id"))
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addUniqueConstraint("uq_task_comparison_arms_runner", ["comparison_id", "clanker_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("task_comparison_arms").execute();
  await db.schema.dropTable("task_comparisons").execute();
}
