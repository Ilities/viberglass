import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Rename table and add adapter_name so the mapping is not Slack-specific
  await sql`ALTER TABLE slack_session_threads RENAME TO chat_session_threads`.execute(db);
  await sql`ALTER TABLE chat_session_threads ADD COLUMN adapter_name VARCHAR(64) NOT NULL DEFAULT 'slack'`.execute(db);

  // Rename indexes to match new table name
  await sql`ALTER INDEX idx_slack_session_threads_session_id RENAME TO idx_chat_session_threads_session_id`.execute(db);
  await sql`ALTER INDEX idx_slack_session_threads_thread_id RENAME TO idx_chat_session_threads_thread_id`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`ALTER INDEX idx_chat_session_threads_session_id RENAME TO idx_slack_session_threads_session_id`.execute(db);
  await sql`ALTER INDEX idx_chat_session_threads_thread_id RENAME TO idx_slack_session_threads_thread_id`.execute(db);
  await sql`ALTER TABLE chat_session_threads DROP COLUMN adapter_name`.execute(db);
  await sql`ALTER TABLE chat_session_threads RENAME TO slack_session_threads`.execute(db);
}
