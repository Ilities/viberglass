import { Kysely, sql } from "kysely";

/**
 * MCP servers and skills an admin approves for the workspace, and which of
 * them each runner gives its agent. Removing a server or skill detaches it
 * from every runner.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("mcp_servers")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "varchar(64)", (col) => col.notNull().unique())
    .addColumn("description", "text")
    .addColumn("url", "text", (col) => col.notNull())
    .addColumn("headers", "jsonb", (col) => col.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("skills")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("name", "varchar(64)", (col) => col.notNull().unique())
    .addColumn("description", "text", (col) => col.notNull())
    .addColumn("storage_url", "text", (col) => col.notNull())
    .addColumn("file_count", "integer", (col) => col.notNull())
    .addColumn("size_bytes", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("clanker_mcp_servers")
    .addColumn("clanker_id", "uuid", (col) => col.notNull().references("clankers.id").onDelete("cascade"))
    .addColumn("mcp_server_id", "uuid", (col) => col.notNull().references("mcp_servers.id").onDelete("cascade"))
    .addPrimaryKeyConstraint("clanker_mcp_servers_pkey", ["clanker_id", "mcp_server_id"])
    .execute();

  await db.schema
    .createTable("clanker_skills")
    .addColumn("clanker_id", "uuid", (col) => col.notNull().references("clankers.id").onDelete("cascade"))
    .addColumn("skill_id", "uuid", (col) => col.notNull().references("skills.id").onDelete("cascade"))
    .addPrimaryKeyConstraint("clanker_skills_pkey", ["clanker_id", "skill_id"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("clanker_skills").execute();
  await db.schema.dropTable("clanker_mcp_servers").execute();
  await db.schema.dropTable("skills").execute();
  await db.schema.dropTable("mcp_servers").execute();
}
