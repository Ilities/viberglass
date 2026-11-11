import { sql, type Kysely } from "kysely";

// A comparison's forks run one after another, so the comparison keeps what to
// ask each fork, and each fork when its first run was asked for. Forks of
// earlier comparisons all started together.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("task_comparisons")
    .addColumn("ask_action", "text", (col) => col.notNull().defaultTo("reply"))
    .addColumn("ask_message", "text", (col) => col.notNull().defaultTo(""))
    .execute();
  await db.schema.alterTable("task_comparison_arms").addColumn("started_at", "timestamptz").execute();
  await sql`UPDATE task_comparison_arms SET started_at = created_at`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("task_comparison_arms").dropColumn("started_at").execute();
  await db.schema.alterTable("task_comparisons").dropColumn("ask_action").dropColumn("ask_message").execute();
}
