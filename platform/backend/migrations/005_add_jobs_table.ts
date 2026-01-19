import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Create jobs table
  await db.schema
    .createTable("jobs")
    .addColumn("id", "varchar(255)", (col) => col.primaryKey())
    .addColumn("tenant_id", "varchar(255)", (col) => col.notNull())
    .addColumn("repository", "varchar(500)", (col) => col.notNull())
    .addColumn("task", "text", (col) => col.notNull())
    .addColumn("branch", "varchar(255)")
    .addColumn("base_branch", "varchar(255)")
    .addColumn("context", "jsonb", (col) => col.defaultTo("{}"))
    .addColumn("settings", "jsonb", (col) => col.defaultTo("{}"))
    .addColumn("status", "varchar(20)", (col) =>
      col
        .notNull()
        .defaultTo("queued")
        .check(sql`status IN ('queued', 'active', 'completed', 'failed')`),
    )
    .addColumn("progress", "jsonb", (col) => col.defaultTo("{}"))
    .addColumn("result", "jsonb")
    .addColumn("error_message", "text")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("started_at", "timestamp")
    .addColumn("finished_at", "timestamp")
    .execute();

  // Create indexes for common queries
  await db.schema
    .createIndex("idx_jobs_status")
    .on("jobs")
    .column("status")
    .execute();

  await db.schema
    .createIndex("idx_jobs_tenant_id")
    .on("jobs")
    .column("tenant_id")
    .execute();

  await db.schema
    .createIndex("idx_jobs_created_at")
    .on("jobs")
    .column("created_at")
    .execute();

  await db.schema
    .createIndex("idx_jobs_status_created_at")
    .on("jobs")
    .columns(["status", "created_at"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex("idx_jobs_status_created_at").execute();
  await db.schema.dropIndex("idx_jobs_created_at").execute();
  await db.schema.dropIndex("idx_jobs_tenant_id").execute();
  await db.schema.dropIndex("idx_jobs_status").execute();
  await db.schema.dropTable("jobs").execute();
}
