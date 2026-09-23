import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Marks each session's opening user turn as consumed by the assistant turn
 * that answered it.
 *
 * Sessions used to be created without that link, so the opening prompt looked
 * like a message still waiting for the agent. "Unconsumed user turns" now means
 * messages people sent that no turn has seen yet, which decides whether a
 * session may complete and what a follow-up turn is asked to do.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    UPDATE agent_turns AS opening
    SET consumed_by_turn_id = answer.id, updated_at = NOW()
    FROM agent_turns AS answer
    WHERE opening.role = 'user'
      AND opening.sequence = 1
      AND opening.consumed_by_turn_id IS NULL
      AND answer.session_id = opening.session_id
      AND answer.role = 'assistant'
      AND answer.sequence = 2
  `.execute(db);
}

export async function down(): Promise<void> {
  // Irreversible by design: before this migration the link simply did not exist.
}
