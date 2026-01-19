import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Create clankers table
  await db.schema
    .createTable("clankers")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("name", "varchar(255)", (col) => col.notNull())
    .addColumn("slug", "varchar(255)", (col) => col.notNull().unique())
    .addColumn("description", "text")
    .addColumn("claude_md", "text")
    .addColumn("agents_md", "text")
    .addColumn("skills_md", "text")
    .addColumn("deployment_type", "varchar(20)", (col) =>
      col.notNull().check(sql`deployment_type IN ('docker', 'ecs')`),
    )
    .addColumn("docker_config", "jsonb")
    .addColumn("ecs_config", "jsonb")
    .addColumn("status", "varchar(20)", (col) =>
      col
        .notNull()
        .defaultTo("inactive")
        .check(sql`status IN ('active', 'inactive', 'deploying', 'failed')`),
    )
    .addColumn("status_message", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create indexes
  await db.schema
    .createIndex("idx_clankers_status")
    .on("clankers")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_clankers_deployment_type")
    .on("clankers")
    .column("deployment_type")
    .execute();

  await db.schema
    .createIndex("idx_clankers_created_at")
    .on("clankers")
    .column("created_at")
    .execute();

  // Create updated_at trigger
  await sql`CREATE TRIGGER update_clankers_updated_at BEFORE UPDATE ON clankers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS update_clankers_updated_at ON clankers;`.execute(
    db,
  );
  await db.schema.dropTable("clankers").execute();
}
