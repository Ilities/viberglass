import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Add integration_id FK column to webhook_provider_configs
  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("integration_id", "uuid", (col) =>
      col.references("pm_integrations.id").onDelete("set null"),
    )
    .execute();

  // 2. Drop the unique constraint on project_id (allow multiple configs per project)
  //    The original migration created project_id with .unique() inline
  await sql`ALTER TABLE webhook_provider_configs DROP CONSTRAINT IF EXISTS webhook_provider_configs_project_id_key`.execute(
    db,
  );

  // 3. Expand provider CHECK constraint to include 'custom'
  //    Drop existing check and create new one
  await sql`ALTER TABLE webhook_provider_configs DROP CONSTRAINT IF EXISTS webhook_provider_configs_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_provider_configs ADD CONSTRAINT webhook_provider_configs_provider_check CHECK (provider IN ('github', 'jira', 'custom'))`.execute(
    db,
  );

  // 4. Expand provider CHECK constraint on webhook_delivery_attempts
  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT IF EXISTS webhook_delivery_attempts_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_provider_check CHECK (provider IN ('github', 'jira', 'custom'))`.execute(
    db,
  );

  // 5. Create index on integration_id
  await db.schema
    .createIndex("idx_webhook_provider_configs_integration_id")
    .on("webhook_provider_configs")
    .column("integration_id")
    .execute();

  // 6. Backfill: link existing webhook configs to matching integrations
  //    Match by (project_id, provider=system)
  await sql`
    UPDATE webhook_provider_configs wpc
    SET integration_id = pmi.id
    FROM pm_integrations pmi
    WHERE wpc.project_id::text = pmi.project_id
      AND wpc.provider = pmi.system
      AND wpc.integration_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop index
  await db.schema
    .dropIndex("idx_webhook_provider_configs_integration_id")
    .ifExists()
    .execute();

  // Restore original provider constraints
  await sql`ALTER TABLE webhook_delivery_attempts DROP CONSTRAINT IF EXISTS webhook_delivery_attempts_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_delivery_attempts ADD CONSTRAINT webhook_delivery_attempts_provider_check CHECK (provider IN ('github', 'jira'))`.execute(
    db,
  );

  await sql`ALTER TABLE webhook_provider_configs DROP CONSTRAINT IF EXISTS webhook_provider_configs_provider_check`.execute(
    db,
  );
  await sql`ALTER TABLE webhook_provider_configs ADD CONSTRAINT webhook_provider_configs_provider_check CHECK (provider IN ('github', 'jira'))`.execute(
    db,
  );

  // Re-add unique constraint on project_id
  await sql`ALTER TABLE webhook_provider_configs ADD CONSTRAINT webhook_provider_configs_project_id_key UNIQUE (project_id)`.execute(
    db,
  );

  // Drop integration_id column
  await db.schema
    .alterTable("webhook_provider_configs")
    .dropColumn("integration_id")
    .execute();
}
