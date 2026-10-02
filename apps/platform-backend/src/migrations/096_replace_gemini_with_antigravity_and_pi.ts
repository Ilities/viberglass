import { Kysely, sql } from "kysely";

/**
 * Gemini CLI is replaced by Google Antigravity, and Pi becomes selectable.
 * Gemini CLI runners are removed rather than converted: Antigravity needs its own image.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM clankers WHERE agent = 'gemini-cli'`.execute(db);

  await sql`ALTER TABLE clankers DROP CONSTRAINT IF EXISTS check_valid_agent`.execute(
    db,
  );

  await sql`
    ALTER TABLE clankers
    ADD CONSTRAINT check_valid_agent
    CHECK (agent IS NULL OR agent IN (
      'claude-code', 'qwen-cli', 'codex', 'opencode', 'kimi-code',
      'antigravity', 'mistral-vibe', 'pi', 'fake'
    ))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM clankers WHERE agent IN ('antigravity', 'pi')`.execute(db);

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
