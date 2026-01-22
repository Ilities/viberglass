import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Create webhook_provider_configs table
  await db.schema
    .createTable("webhook_provider_configs")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("project_id", "varchar(255)", (col) =>
      col
        .references("projects.id")
        .onDelete("cascade")
        .unique(),
    )
    .addColumn("provider", "varchar(50)", (col) =>
      col
        .notNull()
        .check(sql`provider IN ('github', 'jira')`),
    )
    .addColumn("provider_project_id", "varchar(255)")
    .addColumn("secret_location", "varchar(20)", (col) =>
      col
        .notNull()
        .defaultTo("database")
        .check(sql`secret_location IN ('database', 'ssm', 'env')`),
    )
    .addColumn("secret_path", "varchar(500)")
    .addColumn("webhook_secret_encrypted", "text")
    .addColumn("api_token_encrypted", "text")
    .addColumn("allowed_events", "jsonb", (col) => col.defaultTo("[]"))
    .addColumn("auto_execute", "boolean", (col) =>
      col.notNull().defaultTo(false),
    )
    .addColumn("bot_username", "varchar(100)")
    .addColumn("label_mappings", "jsonb", (col) => col.defaultTo("{}"))
    .addColumn("active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create webhook_delivery_attempts table
  await db.schema
    .createTable("webhook_delivery_attempts")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("provider", "varchar(50)", (col) =>
      col
        .notNull()
        .check(sql`provider IN ('github', 'jira')`),
    )
    .addColumn("delivery_id", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("event_type", "varchar(100)", (col) => col.notNull())
    .addColumn("status", "varchar(20)", (col) =>
      col
        .notNull()
        .defaultTo("pending")
        .check(sql`status IN ('pending', 'processing', 'succeeded', 'failed')`),
    )
    .addColumn("error_message", "text")
    .addColumn("payload", "jsonb", (col) => col.notNull().defaultTo("{}"))
    .addColumn("project_id", "varchar(255)")
    .addColumn("ticket_id", "varchar(255)")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("processed_at", "timestamp")
    .execute();

  // Create indexes for webhook_provider_configs
  await db.schema
    .createIndex("idx_webhook_provider_configs_project_id")
    .on("webhook_provider_configs")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("idx_webhook_provider_configs_provider")
    .on("webhook_provider_configs")
    .column("provider")
    .execute();

  await db.schema
    .createIndex("idx_webhook_provider_configs_active")
    .on("webhook_provider_configs")
    .column("active")
    .execute();

  // Create indexes for webhook_delivery_attempts
  await db.schema
    .createIndex("idx_webhook_delivery_attempts_delivery_id")
    .on("webhook_delivery_attempts")
    .column("delivery_id")
    .execute();

  await db.schema
    .createIndex("idx_webhook_delivery_attempts_status")
    .on("webhook_delivery_attempts")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_webhook_delivery_attempts_created_at")
    .on("webhook_delivery_attempts")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("idx_webhook_delivery_attempts_provider_status")
    .on("webhook_delivery_attempts")
    .columns(["provider", "status"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes for webhook_delivery_attempts
  await db.schema
    .dropIndex("idx_webhook_delivery_attempts_provider_status")
    .execute();
  await db.schema
    .dropIndex("idx_webhook_delivery_attempts_created_at")
    .execute();
  await db.schema
    .dropIndex("idx_webhook_delivery_attempts_status")
    .execute();
  await db.schema
    .dropIndex("idx_webhook_delivery_attempts_delivery_id")
    .execute();

  // Drop indexes for webhook_provider_configs
  await db.schema
    .dropIndex("idx_webhook_provider_configs_active")
    .execute();
  await db.schema
    .dropIndex("idx_webhook_provider_configs_provider")
    .execute();
  await db.schema
    .dropIndex("idx_webhook_provider_configs_project_id")
    .execute();

  // Drop tables
  await db.schema.dropTable("webhook_delivery_attempts").execute();
  await db.schema.dropTable("webhook_provider_configs").execute();
}
