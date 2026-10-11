import { Kysely, sql } from "kysely";

// Harness, tracker and webhook provider ids name plugin packages, and the build config
// decides which are included. The app checks ids against its plugin registries instead.
const CONSTRAINTS: Array<[table: string, constraint: string]> = [
  ["clankers", "check_valid_agent"],
  ["projects", "projects_ticket_system_check"],
  ["tickets", "tickets_ticket_system_check"],
  ["webhook_provider_configs", "webhook_provider_configs_provider_check"],
  ["webhook_delivery_attempts", "webhook_delivery_attempts_provider_check"],
];

const AGENTS = "'claude-code', 'qwen-cli', 'codex', 'opencode', 'kimi-code', 'antigravity', 'mistral-vibe', 'pi', 'fake'";
const TICKET_SYSTEMS =
  "'jira', 'linear', 'github', 'gitlab', 'bitbucket', 'azure', 'asana', 'trello', 'monday', 'clickup', 'shortcut', 'slack', 'custom', 'native'";
const WEBHOOK_PROVIDERS = "'github', 'jira', 'shortcut', 'custom'";

export async function up(db: Kysely<any>): Promise<void> {
  for (const [table, constraint] of CONSTRAINTS) {
    await sql`ALTER TABLE ${sql.raw(table)} DROP CONSTRAINT IF EXISTS ${sql.raw(constraint)}`.execute(db);
  }
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE clankers ADD CONSTRAINT check_valid_agent CHECK (agent IS NULL OR agent IN (${sql.raw(AGENTS)}))`.execute(db);
  for (const table of ["projects", "tickets"]) {
    await sql`ALTER TABLE ${sql.raw(table)} ADD CONSTRAINT ${sql.raw(`${table}_ticket_system_check`)} CHECK (ticket_system IN (${sql.raw(TICKET_SYSTEMS)}))`.execute(db);
  }
  for (const table of ["webhook_provider_configs", "webhook_delivery_attempts"]) {
    await sql`ALTER TABLE ${sql.raw(table)} ADD CONSTRAINT ${sql.raw(`${table}_provider_check`)} CHECK (provider IN (${sql.raw(WEBHOOK_PROVIDERS)}))`.execute(db);
  }
}
