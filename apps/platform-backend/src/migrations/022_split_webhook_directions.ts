import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("direction", "varchar(20)", (col) =>
      col
        .notNull()
        .defaultTo("inbound")
        .check(sql`direction IN ('inbound', 'outbound')`),
    )
    .execute();

  await db.schema
    .createIndex("idx_webhook_provider_configs_integration_direction")
    .on("webhook_provider_configs")
    .columns(["integration_id", "direction"])
    .execute();

  await db.schema
    .createIndex("idx_webhook_provider_configs_provider_direction_active")
    .on("webhook_provider_configs")
    .columns(["provider", "direction", "active"])
    .execute();

  // Backfill outbound rows from existing mixed webhook configs.
  // Existing rows remain inbound; copied outbound rows subscribe to job lifecycle events.
  await sql`
    INSERT INTO webhook_provider_configs (
      id,
      project_id,
      provider,
      direction,
      provider_project_id,
      integration_id,
      secret_location,
      secret_path,
      webhook_secret_encrypted,
      api_token_encrypted,
      allowed_events,
      auto_execute,
      bot_username,
      label_mappings,
      active,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      inbound.project_id,
      inbound.provider,
      'outbound',
      inbound.provider_project_id,
      inbound.integration_id,
      inbound.secret_location,
      inbound.secret_path,
      NULL,
      inbound.api_token_encrypted,
      '["job_started", "job_ended"]'::jsonb,
      false,
      inbound.bot_username,
      inbound.label_mappings,
      inbound.active,
      inbound.created_at,
      inbound.updated_at
    FROM webhook_provider_configs inbound
    WHERE inbound.direction = 'inbound'
      AND inbound.integration_id IS NOT NULL
      AND (inbound.api_token_encrypted IS NOT NULL OR inbound.provider_project_id IS NOT NULL)
      AND NOT EXISTS (
        SELECT 1
        FROM webhook_provider_configs outbound
        WHERE outbound.integration_id = inbound.integration_id
          AND outbound.direction = 'outbound'
      )
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Remove outbound rows first before dropping direction column.
  await db
    .deleteFrom("webhook_provider_configs")
    .where("direction", "=", "outbound")
    .execute();

  await db.schema
    .dropIndex("idx_webhook_provider_configs_provider_direction_active")
    .ifExists()
    .execute();

  await db.schema
    .dropIndex("idx_webhook_provider_configs_integration_direction")
    .ifExists()
    .execute();

  await db.schema
    .alterTable("webhook_provider_configs")
    .dropColumn("direction")
    .execute();
}
