import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("model_endpoints")
    .addColumn("id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(64)", (c) => c.notNull().unique())
    .addColumn("base_url", "text", (c) => c.notNull())
    .addColumn("api_format", "varchar(32)", (c) => c.notNull())
    .addColumn("auth", "jsonb", (c) => c.notNull())
    .addColumn("secret_id", "uuid", (c) =>
      c.references("secrets.id").onDelete("restrict"),
    )
    .addColumn("extra_headers", "jsonb", (c) =>
      c.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn("models", "jsonb", (c) =>
      c.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("source", "varchar(16)", (c) => c.notNull().defaultTo("manual"))
    .addColumn("deployment_id", "uuid")
    .addColumn("may_cold_start", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      "model_endpoints_format",
      sql`api_format IN ('openai-chat', 'openai-responses', 'anthropic-messages')`,
    )
    .addCheckConstraint(
      "model_endpoints_source",
      sql`(source = 'manual' AND deployment_id IS NULL) OR (source = 'deployment' AND deployment_id IS NOT NULL)`,
    )
    .addCheckConstraint(
      "model_endpoints_auth",
      sql`(auth->>'scheme' = 'none' AND secret_id IS NULL) OR (auth->>'scheme' IN ('bearer', 'header') AND secret_id IS NOT NULL)`,
    )
    .execute();
  await db.schema
    .createTable("clanker_model_endpoints")
    .addColumn("clanker_id", "uuid", (c) =>
      c.primaryKey().references("clankers.id").onDelete("cascade"),
    )
    .addColumn("endpoint_id", "uuid", (c) =>
      c.notNull().references("model_endpoints.id").onDelete("restrict"),
    )
    .addColumn("model", "text", (c) => c.notNull())
    .execute();
  await db.schema
    .createIndex("clanker_model_endpoints_endpoint")
    .on("clanker_model_endpoints")
    .column("endpoint_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("clanker_model_endpoints").execute();
  await db.schema.dropTable("model_endpoints").execute();
}
