import { Kysely, sql } from "kysely";

// People who steer a task can pause its agent: the run stops, the
// conversation stays, and asks wait until someone resumes it. A paused session
// is still the task's open session with that agent.
const OPEN_BEFORE = `'active', 'waiting_on_user', 'waiting_on_approval'`;
const OPEN_AFTER = `'active', 'waiting_on_user', 'waiting_on_approval', 'paused'`;

async function constrain(db: Kysely<any>, open: string): Promise<void> {
  await sql`ALTER TABLE agent_sessions DROP CONSTRAINT IF EXISTS agent_sessions_status_check`.execute(db);
  await sql.raw(`ALTER TABLE agent_sessions ADD CONSTRAINT agent_sessions_status_check CHECK (status IN (${open}, 'completed', 'failed', 'cancelled'))`).execute(db);
  await sql`DROP INDEX IF EXISTS uq_agent_sessions_ticket_clanker_open`.execute(db);
  await sql.raw(`CREATE UNIQUE INDEX uq_agent_sessions_ticket_clanker_open ON agent_sessions (ticket_id, clanker_id) WHERE status IN (${open})`).execute(db);
}

export async function up(db: Kysely<any>): Promise<void> {
  await constrain(db, OPEN_AFTER);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`UPDATE agent_sessions SET status = 'waiting_on_user', updated_at = now() WHERE status = 'paused'`.execute(db);
  await constrain(db, OPEN_BEFORE);
}
