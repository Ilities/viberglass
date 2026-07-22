import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Remove historical duplicates (same session + sequence), keeping the
  // earliest row, so the unique index can be created safely.
  await sql`
    DELETE FROM agent_session_events a
    USING agent_session_events b
    WHERE a.session_id = b.session_id
      AND a.sequence = b.sequence
      AND (
        a.created_at > b.created_at
        OR (a.created_at = b.created_at AND a.id > b.id)
      )
  `.execute(db);

  await db.schema
    .createIndex("agent_session_events_session_sequence_unique")
    .on("agent_session_events")
    .columns(["session_id", "sequence"])
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema
    .dropIndex("agent_session_events_session_sequence_unique")
    .execute();
}
