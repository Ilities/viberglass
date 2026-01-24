import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  // Add heartbeat columns to jobs table
  await db.schema
    .alterTable("jobs")
    .addColumn("last_heartbeat", "timestamp")
    .execute();

  await db.schema
    .alterTable("jobs")
    .addColumn("last_heartbeat_grace_period_seconds", "integer", (col) =>
      col.defaultTo(300),
    )
    .execute();

  // Create job_progress_updates table
  await db.schema
    .createTable("job_progress_updates")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("job_id", "varchar(255)", (col) =>
      col.notNull().references("jobs.id").onDelete("cascade"),
    )
    .addColumn("step", "varchar(100)")
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("details", "jsonb")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create index for querying progress updates by job
  await db.schema
    .createIndex("idx_job_progress_updates_job_id_created_at")
    .on("job_progress_updates")
    .columns(["job_id", "created_at"])
    .execute();

  // Create job_log_lines table
  await db.schema
    .createTable("job_log_lines")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("job_id", "varchar(255)", (col) =>
      col.notNull().references("jobs.id").onDelete("cascade"),
    )
    .addColumn("level", "varchar(20)", (col) =>
      col
        .notNull()
        .check(sql`level IN ('info', 'warn', 'error', 'debug')`),
    )
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("source", "varchar(100)")
    .addColumn("created_at", "timestamp", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // Create index for querying log lines by job
  await db.schema
    .createIndex("idx_job_log_lines_job_id_created_at")
    .on("job_log_lines")
    .columns(["job_id", "created_at"])
    .execute();

  // Create index for stale job queries
  await db.schema
    .createIndex("idx_jobs_last_heartbeat")
    .on("jobs")
    .column("last_heartbeat")
    .where("status", "=", "active")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  // Drop indexes
  await db.schema.dropIndex("idx_jobs_last_heartbeat").execute();
  await db.schema
    .dropIndex("idx_job_log_lines_job_id_created_at")
    .execute();
  await db.schema
    .dropIndex("idx_job_progress_updates_job_id_created_at")
    .execute();

  // Drop tables
  await db.schema.dropTable("job_log_lines").execute();
  await db.schema.dropTable("job_progress_updates").execute();

  // Drop columns from jobs table
  await db.schema
    .alterTable("jobs")
    .dropColumn("last_heartbeat_grace_period_seconds")
    .execute();

  await db.schema.alterTable("jobs").dropColumn("last_heartbeat").execute();
}
