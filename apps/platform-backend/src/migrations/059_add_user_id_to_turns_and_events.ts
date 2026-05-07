import type { Kysely } from "kysely";

export async function up(db: Kysely<Record<string, unknown>>): Promise<void> {
  await db.schema
    .alterTable("agent_turns")
    .addColumn("user_id", "text")
    .execute();

  await db.schema
    .alterTable("agent_session_events")
    .addColumn("user_id", "text")
    .execute();
}

export async function down(db: Kysely<Record<string, unknown>>): Promise<void> {
  await db.schema
    .alterTable("agent_session_events")
    .dropColumn("user_id")
    .execute();

  await db.schema
    .alterTable("agent_turns")
    .dropColumn("user_id")
    .execute();
}
