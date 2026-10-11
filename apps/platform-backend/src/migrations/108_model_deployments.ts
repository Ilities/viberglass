import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("model_host_accounts")
    .addColumn("id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(64)", (c) => c.notNull().unique())
    .addColumn("host", "varchar(16)", (c) => c.notNull())
    .addColumn("client_id", "text", (c) => c.notNull())
    .addColumn("client_secret_id", "uuid", (c) =>
      c.notNull().references("secrets.id").onDelete("restrict"),
    )
    .addColumn("endpoint_key_secret_id", "uuid", (c) =>
      c.notNull().references("secrets.id").onDelete("restrict"),
    )
    .addColumn("hugging_face_token_secret_id", "uuid", (c) =>
      c.references("secrets.id").onDelete("restrict"),
    )
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint("model_host_accounts_host", sql`host IN ('verda')`)
    .execute();
  await db.schema
    .createTable("model_deployments")
    .addColumn("id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(64)", (c) => c.notNull().unique())
    .addColumn("account_id", "uuid", (c) =>
      c.notNull().references("model_host_accounts.id").onDelete("restrict"),
    )
    .addColumn("external_id", "text", (c) => c.notNull())
    .addColumn("model", "text", (c) => c.notNull())
    .addColumn("flavour", "jsonb", (c) => c.notNull())
    .addColumn("serving_args", "jsonb", (c) =>
      c.notNull().defaultTo(sql`'[]'::jsonb`),
    )
    .addColumn("mode", "varchar(16)", (c) =>
      c.notNull().defaultTo("scale-to-zero"),
    )
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addCheckConstraint(
      "model_deployments_mode",
      sql`mode IN ('scale-to-zero', 'keep-warm', 'stopped')`,
    )
    .execute();
  await db.schema
    .alterTable("model_endpoints")
    .addForeignKeyConstraint(
      "model_endpoints_deployment",
      ["deployment_id"],
      "model_deployments",
      ["id"],
    )
    .onDelete("restrict")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("model_endpoints")
    .dropConstraint("model_endpoints_deployment")
    .execute();
  await db.schema.dropTable("model_deployments").execute();
  await db.schema.dropTable("model_host_accounts").execute();
}
