import { sql, type Kysely } from "kysely";

// A Files space keeps its working files as immutable snapshots in object
// storage. One run at a time may change them: it holds the space's lease, and
// its fencing token proves it still does when it saves.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("space_file_snapshots")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("parent_snapshot_id", "uuid", (col) => col.references("space_file_snapshots.id").onDelete("set null"))
    .addColumn("job_id", "varchar(255)", (col) => col.references("jobs.id").onDelete("set null"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("storage_url", "text", (col) => col.notNull())
    .addColumn("archive_sha256", "varchar(64)", (col) => col.notNull())
    .addColumn("archive_bytes", "bigint", (col) => col.notNull())
    .addColumn("file_count", "integer", (col) => col.notNull())
    .addColumn("total_bytes", "bigint", (col) => col.notNull())
    .addColumn("manifest", "jsonb", (col) => col.notNull())
    .addColumn("changes", "jsonb", (col) => col.notNull())
    .addColumn("partial", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema
    .createIndex("idx_space_file_snapshots_project")
    .on("space_file_snapshots")
    .columns(["project_id", "created_at"])
    .execute();

  await db.schema
    .createTable("space_file_state")
    .addColumn("project_id", "uuid", (col) => col.primaryKey().references("projects.id").onDelete("cascade"))
    .addColumn("current_snapshot_id", "uuid", (col) => col.references("space_file_snapshots.id"))
    .addColumn("lease_job_id", "varchar(255)", (col) => col.references("jobs.id").onDelete("set null"))
    .addColumn("lease_token", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("lease_expires_at", "timestamptz")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema
    .createTable("space_file_runs")
    .addColumn("job_id", "varchar(255)", (col) => col.primaryKey().references("jobs.id").onDelete("cascade"))
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("status", "varchar(16)", (col) =>
      col.notNull().check(sql`status IN ('waiting', 'running', 'saved', 'released')`),
    )
    .addColumn("base_snapshot_id", "uuid", (col) => col.references("space_file_snapshots.id").onDelete("set null"))
    .addColumn("checkpoint_snapshot_id", "uuid", (col) => col.notNull().unique())
    .addColumn("lease_token", "bigint")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("started_at", "timestamptz")
    .addColumn("finished_at", "timestamptz")
    .execute();
  await db.schema
    .createIndex("idx_space_file_runs_waiting")
    .on("space_file_runs")
    .columns(["project_id", "created_at"])
    .where(sql.ref("status"), "=", "waiting")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("space_file_runs").execute();
  await db.schema.dropTable("space_file_state").execute();
  await db.schema.dropTable("space_file_snapshots").execute();
}
