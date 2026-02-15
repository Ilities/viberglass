import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE clankers DROP CONSTRAINT IF EXISTS check_valid_agent`.execute(
    db,
  );

  await sql`
    ALTER TABLE clankers
    ADD CONSTRAINT check_valid_agent
    CHECK (agent IS NULL OR agent IN (
      'claude-code', 'qwen-cli', 'qwen-api', 'codex', 'opencode', 'kimi-code',
      'gemini-cli', 'mistral-vibe'
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
      'claude-code', 'qwen-cli', 'qwen-api', 'codex', 'kimi-code',
      'gemini-cli', 'mistral-vibe'
    ))
  `.execute(db);
}
