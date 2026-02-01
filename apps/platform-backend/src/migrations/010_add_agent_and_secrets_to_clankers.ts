import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add agent column
  await db.schema
    .alterTable("clankers")
    .addColumn("agent", "varchar(50)", (col) => col.defaultTo("claude-code"))
    .execute();

  // Add secret_ids column as JSONB array
  await db.schema
    .alterTable("clankers")
    .addColumn("secret_ids", "jsonb", (col) =>
      col.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .execute();

  // Create index on agent for efficient filtering
  await db.schema
    .createIndex("idx_clankers_agent")
    .on("clankers")
    .column("agent")
    .execute();

  // Create GIN index on secret_ids for efficient JSONB array queries
  await db.schema
    .createIndex("idx_clankers_secret_ids")
    .on("clankers")
    .using("gin")
    .column("secret_ids")
    .execute();

  // Add check constraint for valid agent types
  await sql`
    ALTER TABLE clankers
    ADD CONSTRAINT check_valid_agent
    CHECK (agent IS NULL OR agent IN (
      'claude-code', 'qwen-cli', 'qwen-api', 'codex',
      'gemini-cli', 'mistral-vibe'
    ))
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop check constraint
  await sql`ALTER TABLE clankers DROP CONSTRAINT IF EXISTS check_valid_agent`.execute(
    db,
  );

  // Drop indexes
  await db.schema.dropIndex("idx_clankers_secret_ids").execute();
  await db.schema.dropIndex("idx_clankers_agent").execute();

  // Drop columns
  await db.schema.alterTable("clankers").dropColumn("secret_ids").execute();
  await db.schema.alterTable("clankers").dropColumn("agent").execute();
}
