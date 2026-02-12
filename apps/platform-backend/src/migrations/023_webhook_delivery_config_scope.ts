import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Expand provider checks to include Shortcut.
  await sql`ALTER TABLE webhook_provider_configs DROP CONSTRAINT IF EXISTS webhook_provider_configs_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_provider_configs ADD CONSTRAINT webhook_provider_configs_provider_check CHECK (provider IN ('github', 'jira', 'shortcut', 'custom'))`.execute(
    db,
  );

  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT IF EXISTS webhook_delivery_attempts_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_provider_check CHECK (provider IN ('github', 'jira', 'shortcut', 'custom'))`.execute(
    db,
  );

  // Track deliveries by the exact webhook config that handled the request.
  await db.schema
    .alterTable("webhook_delivery_attempts")
    .addColumn("webhook_config_id", "uuid", (col) =>
      col.references("webhook_provider_configs.id").onDelete("set null"),
    )
    .execute();

  // Best-effort backfill for historical rows by provider + project.
  await sql`
    UPDATE webhook_delivery_attempts d
    SET webhook_config_id = matched.config_id
    FROM (
      SELECT
        delivery.id AS delivery_row_id,
        config.id AS config_id
      FROM webhook_delivery_attempts delivery
      JOIN LATERAL (
        SELECT c.id
        FROM webhook_provider_configs c
        WHERE c.direction = 'inbound'
          AND c.provider = delivery.provider
          AND (
            (delivery.project_id IS NOT NULL AND c.project_id::text = delivery.project_id)
            OR (delivery.project_id IS NULL AND c.project_id IS NULL)
          )
        ORDER BY c.active DESC, c.created_at DESC
        LIMIT 1
      ) config ON TRUE
      WHERE delivery.webhook_config_id IS NULL
    ) matched
    WHERE d.id = matched.delivery_row_id
      AND d.webhook_config_id IS NULL
  `.execute(db);

  await db.schema
    .createIndex("idx_webhook_delivery_attempts_webhook_config_id")
    .on("webhook_delivery_attempts")
    .column("webhook_config_id")
    .execute();

  await db.schema
    .createIndex("idx_webhook_delivery_attempts_config_status_created")
    .on("webhook_delivery_attempts")
    .columns(["webhook_config_id", "status", "created_at"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_webhook_delivery_attempts_config_status_created")
    .ifExists()
    .execute();

  await db.schema
    .dropIndex("idx_webhook_delivery_attempts_webhook_config_id")
    .ifExists()
    .execute();

  await db.schema
    .alterTable("webhook_delivery_attempts")
    .dropColumn("webhook_config_id")
    .execute();

  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT IF EXISTS webhook_delivery_attempts_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_provider_check CHECK (provider IN ('github', 'jira', 'custom'))`.execute(
    db,
  );

  await sql`ALTER TABLE webhook_provider_configs DROP CONSTRAINT IF EXISTS webhook_provider_configs_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_provider_configs ADD CONSTRAINT webhook_provider_configs_provider_check CHECK (provider IN ('github', 'jira', 'custom'))`.execute(
    db,
  );
}
