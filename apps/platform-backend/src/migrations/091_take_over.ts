import { Kysely } from "kysely";

// Someone can take over a task's work from the agent: the agent is paused
// while they work on the task's branch themselves, until they hand it back.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("tickets")
    .addColumn("taken_over_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("taken_over_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("tickets").dropColumn("taken_over_by").dropColumn("taken_over_at").execute();
}
