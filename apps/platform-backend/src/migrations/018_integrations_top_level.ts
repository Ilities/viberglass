import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // 1. Create new top-level integrations table
  await db.schema
    .createTable("integrations")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("system", "varchar(50)", (col) => col.notNull())
    .addColumn("config", "jsonb", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 2. Create join table for many-to-many relationship between projects and integrations
  await db.schema
    .createTable("project_integrations")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("integration_id", "uuid", (col) =>
      col.notNull().references("integrations.id").onDelete("cascade"),
    )
    .addColumn("is_primary", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 3. Add unique constraint to prevent duplicate links
  await db.schema
    .createIndex("idx_project_integrations_unique")
    .on("project_integrations")
    .columns(["project_id", "integration_id"])
    .unique()
    .execute();

  // 4. Add index for faster lookups
  await db.schema
    .createIndex("idx_project_integrations_project_id")
    .on("project_integrations")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("idx_project_integrations_integration_id")
    .on("project_integrations")
    .column("integration_id")
    .execute();

  await db.schema
    .createIndex("idx_integrations_system")
    .on("integrations")
    .column("system")
    .execute();

  // 5. Migrate data from old pm_integrations table
  // For each unique (project_id, system, config) in pm_integrations, create an integration
  // and link it to the project
  await sql`
    INSERT INTO integrations (id, name, system, config, is_active, created_at, updated_at)
    SELECT 
      gen_random_uuid(),
      'Integration for ' || p.name || ' (' || pm.system || ')',
      pm.system,
      pm.config,
      pm.is_active,
      pm.created_at,
      pm.updated_at
    FROM pm_integrations pm
    JOIN projects p ON p.id = pm.project_id
  `.execute(db);

  // 6. Create links in project_integrations join table
  await sql`
    INSERT INTO project_integrations (project_id, integration_id, is_primary, created_at)
    SELECT 
      pm.project_id,
      i.id,
      true,
      pm.created_at
    FROM pm_integrations pm
    JOIN integrations i ON i.system = pm.system
    JOIN (
      SELECT project_id, system, config, created_at
      FROM pm_integrations
    ) pm2 ON pm2.project_id = pm.project_id AND pm2.system = pm.system AND pm2.config = pm.config
    WHERE i.config = pm.config
  `.execute(db);

  // 7. Update webhook_provider_configs to reference the new integrations table
  // First add the new column
  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("new_integration_id", "uuid")
    .execute();

  // Migrate webhook configs to reference new integration IDs
  await sql`
    UPDATE webhook_provider_configs wpc
    SET new_integration_id = i.id
    FROM integrations i
    WHERE wpc.integration_id = (
      SELECT id FROM pm_integrations pm 
      WHERE pm.system = wpc.provider 
      LIMIT 1
    )
  `.execute(db);

  // Drop old integration_id column and rename new one
  await db.schema
    .alterTable("webhook_provider_configs")
    .dropColumn("integration_id")
    .execute();

  await sql`
    ALTER TABLE webhook_provider_configs 
    RENAME COLUMN new_integration_id TO integration_id
  `.execute(db);

  // Add foreign key constraint
  await sql`
    ALTER TABLE webhook_provider_configs
    ADD CONSTRAINT webhook_provider_configs_integration_id_fkey
    FOREIGN KEY (integration_id) REFERENCES integrations(id)
    ON DELETE SET NULL
  `.execute(db);

  // Recreate index
  await db.schema
    .createIndex("idx_webhook_provider_configs_integration_id")
    .on("webhook_provider_configs")
    .column("integration_id")
    .execute();

  // 8. Create trigger for updated_at on integrations
  await sql`CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );

  // 9. Drop old pm_integrations table (data has been migrated)
  await sql`DROP TRIGGER IF EXISTS update_pm_integrations_updated_at ON pm_integrations;`.execute(
    db,
  );
  await db.schema.dropTable("pm_integrations").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // 1. Recreate old pm_integrations table
  await db.schema
    .createTable("pm_integrations")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("system", "varchar(50)", (col) => col.notNull())
    .addColumn("config", "jsonb", (col) => col.notNull())
    .addColumn("is_active", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 2. Migrate data back
  await sql`
    INSERT INTO pm_integrations (id, project_id, system, config, is_active, created_at, updated_at)
    SELECT 
      i.id,
      pi.project_id,
      i.system,
      i.config,
      i.is_active,
      i.created_at,
      i.updated_at
    FROM integrations i
    JOIN project_integrations pi ON pi.integration_id = i.id
  `.execute(db);

  // 3. Restore webhook_provider_configs integration_id references
  await db.schema
    .alterTable("webhook_provider_configs")
    .dropColumn("integration_id")
    .execute();

  await db.schema
    .alterTable("webhook_provider_configs")
    .addColumn("integration_id", "uuid", (col) =>
      col.references("pm_integrations.id").onDelete("set null"),
    )
    .execute();

  // 4. Create indexes on old table
  await db.schema
    .createIndex("pm_integrations_project_id_idx")
    .on("pm_integrations")
    .column("project_id")
    .execute();

  await db.schema
    .createIndex("pm_integrations_system_idx")
    .on("pm_integrations")
    .column("system")
    .execute();

  await db.schema
    .createIndex("pm_integrations_project_system_unique")
    .on("pm_integrations")
    .columns(["project_id", "system"])
    .unique()
    .execute();

  // 5. Create trigger
  await sql`CREATE TRIGGER update_pm_integrations_updated_at BEFORE UPDATE ON pm_integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );

  // 6. Drop new tables
  await sql`DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;`.execute(
    db,
  );
  await db.schema.dropTable("project_integrations").execute();
  await db.schema.dropTable("integrations").execute();
}
