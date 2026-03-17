import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await sql`
    ALTER TABLE agent_session_events
    DROP CONSTRAINT agent_session_events_type_check
  `.execute(db);

  await sql`
    ALTER TABLE agent_session_events
    ADD CONSTRAINT agent_session_events_type_check
    CHECK (event_type IN (
      'session_started', 'turn_started', 'user_message', 'assistant_message',
      'progress', 'reasoning', 'tool_call_started', 'tool_call_completed',
      'needs_input', 'needs_approval', 'approval_resolved', 'artifact_updated',
      'turn_completed', 'turn_failed', 'session_completed', 'session_failed',
      'session_cancelled'
    ))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`
    ALTER TABLE agent_session_events
    DROP CONSTRAINT agent_session_events_type_check
  `.execute(db);

  await sql`
    ALTER TABLE agent_session_events
    ADD CONSTRAINT agent_session_events_type_check
    CHECK (event_type IN (
      'session_started', 'turn_started', 'user_message', 'assistant_message',
      'progress', 'reasoning', 'tool_call_started', 'tool_call_completed',
      'needs_input', 'needs_approval', 'approval_resolved', 'artifact_updated',
      'turn_completed', 'turn_failed', 'session_completed', 'session_failed'
    ))
  `.execute(db);
}
