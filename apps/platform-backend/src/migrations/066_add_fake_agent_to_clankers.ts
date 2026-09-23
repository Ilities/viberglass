import { Kysely, sql } from "kysely";

/**
 * Allows the deterministic fake agent used by the end-to-end suite.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE clankers DROP CONSTRAINT IF EXISTS check_valid_agent`.execute(
    db,
  );

  await sql`
    ALTER TABLE clankers
    ADD CONSTRAINT check_valid_agent
    CHECK (agent IS NULL OR agent IN (
      'claude-code', 'qwen-cli', 'codex', 'opencode', 'kimi-code',
      'gemini-cli', 'mistral-vibe', 'fake'
    ))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE clankers DROP CONSTRAINT IF EXISTS check_valid_agent`.execute(
    db,
  );

  await sql`
    ALTER TABLE clankers
    ADD CONSTRAINT check_valid_agent
    CHECK (agent IS NULL OR agent IN (
      'claude-code', 'qwen-cli', 'codex', 'opencode', 'kimi-code',
      'gemini-cli', 'mistral-vibe'
    ))
  `.execute(db);
}
