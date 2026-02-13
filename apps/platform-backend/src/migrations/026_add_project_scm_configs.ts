import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("project_scm_configs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("project_id", "uuid", (col) =>
      col.notNull().references("projects.id").onDelete("cascade"),
    )
    .addColumn("integration_id", "uuid", (col) =>
      col.notNull().references("integrations.id").onDelete("cascade"),
    )
    .addColumn("source_repository", "varchar(500)", (col) => col.notNull())
    .addColumn("base_branch", "varchar(255)", (col) =>
      col.notNull().defaultTo("main"),
    )
    .addColumn("pr_repository", "varchar(500)")
    .addColumn("pr_base_branch", "varchar(255)")
    .addColumn("branch_name_template", "varchar(255)")
    .addColumn("credential_secret_id", "uuid", (col) =>
      col.references("secrets.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await db.schema
    .createIndex("idx_project_scm_configs_project_unique")
    .on("project_scm_configs")
    .column("project_id")
    .unique()
    .execute();

  await db.schema
    .createIndex("idx_project_scm_configs_integration_id")
    .on("project_scm_configs")
    .column("integration_id")
    .execute();

  await db.schema
    .createIndex("idx_project_scm_configs_credential_secret_id")
    .on("project_scm_configs")
    .column("credential_secret_id")
    .execute();

  await sql`CREATE TRIGGER update_project_scm_configs_updated_at BEFORE UPDATE ON project_scm_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS update_project_scm_configs_updated_at ON project_scm_configs;`.execute(
    db,
  );

  await db.schema
    .dropIndex("idx_project_scm_configs_credential_secret_id")
    .execute();
  await db.schema
    .dropIndex("idx_project_scm_configs_integration_id")
    .execute();
  await db.schema
    .dropIndex("idx_project_scm_configs_project_unique")
    .execute();

  await db.schema.dropTable("project_scm_configs").execute();
}
