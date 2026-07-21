import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("agent_turns")
    .addColumn("consumed_by_turn_id", "text")
    .execute();

  // Historical turns predate the queue model: mark them as consumed
  // (self-referenced) so they are never treated as queued messages.
  await sql`
    UPDATE agent_turns
    SET consumed_by_turn_id = id
    WHERE consumed_by_turn_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("agent_turns")
    .dropColumn("consumed_by_turn_id")
    .execute();
}
