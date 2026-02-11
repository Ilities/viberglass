import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Previous schema enforced global uniqueness by delivery_id, which blocks
  // multi-config webhook setups from reusing provider delivery identifiers.
  await sql`
    ALTER TABLE webhook_delivery_attempts
    DROP CONSTRAINT IF EXISTS webhook_delivery_attempts_delivery_id_key
  `.execute(db);

  // Uniqueness is explicitly config-scoped.
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_webhook_delivery_attempts_config_delivery_id
    ON webhook_delivery_attempts (webhook_config_id, delivery_id)
    WHERE webhook_config_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS uq_webhook_delivery_attempts_config_delivery_id
  `.execute(db);

  // If rollback happens after scoped duplicates exist, keep the newest row.
  await sql`
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY delivery_id
          ORDER BY created_at DESC, id DESC
        ) AS rn
      FROM webhook_delivery_attempts
    )
    DELETE FROM webhook_delivery_attempts
    WHERE id IN (
      SELECT id
      FROM ranked
      WHERE rn > 1
    )
  `.execute(db);

  await sql`
    ALTER TABLE webhook_delivery_attempts
    DROP CONSTRAINT IF EXISTS webhook_delivery_attempts_delivery_id_key
  `.execute(db);

  await sql`
    ALTER TABLE webhook_delivery_attempts
    ADD CONSTRAINT webhook_delivery_attempts_delivery_id_key UNIQUE (delivery_id)
  `.execute(db);
}
