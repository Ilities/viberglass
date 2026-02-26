import { Kysely, sql } from "kysely";

/**
 * Migration: Add integration_credentials table
 * 
 * This creates a durable SCM credential product model that:
 * - Belongs to an integration (SCM integrations)
 * - Has a name, credential type, and encrypted value storage
 * - Supports credential rotation via the secrets table
 * - Provides clear ownership and lifecycle for SCM credentials
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Create integration_credentials table
  await db.schema
    .createTable("integration_credentials")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`)
    )
    .addColumn("integration_id", "uuid", (col) =>
      col.notNull().references("integrations.id").onDelete("cascade")
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("credential_type", "varchar(50)", (col) =>
      col.notNull() // 'token', 'ssh_key', 'oauth', 'basic'
    )
    .addColumn("secret_id", "uuid", (col) =>
      col.notNull().references("secrets.id").onDelete("restrict")
    )
    .addColumn("is_default", "boolean", (col) =>
      col.notNull().defaultTo(false)
    )
    .addColumn("description", "text")
    .addColumn("expires_at", "timestamp")
    .addColumn("last_used_at", "timestamp")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  // Index for looking up credentials by integration
  await db.schema
    .createIndex("idx_integration_credentials_integration_id")
    .on("integration_credentials")
    .column("integration_id")
    .execute();

  // Index for finding default credentials per integration
  await db.schema
    .createIndex("idx_integration_credentials_default")
    .on("integration_credentials")
    .columns(["integration_id", "is_default"])
    .execute();

  // Unique constraint: only one default credential per integration
  await db.schema
    .createIndex("idx_integration_credentials_unique_default")
    .on("integration_credentials")
    .columns(["integration_id", "is_default"])
    .unique()
    .where("is_default", "=", true)
    .execute();

  // Trigger for updated_at
  await sql`CREATE TRIGGER update_integration_credentials_updated_at BEFORE UPDATE ON integration_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db
  );

  // Add integration_credential_id to project_scm_configs (optional, for explicit credential selection)
  await db.schema
    .alterTable("project_scm_configs")
    .addColumn("integration_credential_id", "uuid", (col) =>
      col.references("integration_credentials.id").onDelete("set null")
    )
    .execute();

  await db.schema
    .createIndex("idx_project_scm_configs_credential_id")
    .on("project_scm_configs")
    .column("integration_credential_id")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex("idx_project_scm_configs_credential_id")
    .execute();

  await db.schema
    .alterTable("project_scm_configs")
    .dropColumn("integration_credential_id")
    .execute();

  await sql`DROP TRIGGER IF EXISTS update_integration_credentials_updated_at ON integration_credentials;`.execute(
    db
  );

  await db.schema
    .dropIndex("idx_integration_credentials_unique_default")
    .execute();

  await db.schema
    .dropIndex("idx_integration_credentials_default")
    .execute();

  await db.schema
    .dropIndex("idx_integration_credentials_integration_id")
    .execute();

  await db.schema.dropTable("integration_credentials").execute();
}
