import { sql, type Kysely } from "kysely";

// Artifacts are a Files space's named deliverables. Each version is an
// immutable copy of the files it was declared with, kept apart from the
// working snapshots so later edits and pruning don't change it. Old versions
// and snapshots are purged: their rows stay, so the thread and later
// publications can still name them.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("artifacts")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("project_id", "uuid", (col) => col.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("ticket_id", "uuid", (col) => col.references("tickets.id").onDelete("set null"))
    .addColumn("title", "varchar(200)", (col) => col.notNull())
    .addColumn("current_version_id", "uuid")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("idx_artifacts_project").on("artifacts").columns(["project_id", "updated_at"]).execute();

  await db.schema
    .createTable("artifact_versions")
    .addColumn("id", "uuid", (col) => col.primaryKey())
    .addColumn("artifact_id", "uuid", (col) => col.notNull().references("artifacts.id").onDelete("cascade"))
    .addColumn("number", "integer", (col) => col.notNull())
    .addColumn("snapshot_id", "uuid", (col) => col.references("space_file_snapshots.id").onDelete("set null"))
    .addColumn("job_id", "varchar(255)", (col) => col.references("jobs.id").onDelete("set null"))
    .addColumn("created_by", "uuid", (col) => col.references("users.id").onDelete("set null"))
    .addColumn("format", "varchar(16)", (col) => col.notNull())
    .addColumn("entrypoint", "text", (col) => col.notNull())
    .addColumn("files", "jsonb", (col) => col.notNull())
    .addColumn("storage_prefix", "text", (col) => col.notNull())
    .addColumn("total_bytes", "bigint", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("unavailable_at", "timestamptz")
    .addColumn("purged_at", "timestamptz")
    .addUniqueConstraint("uq_artifact_versions_number", ["artifact_id", "number"])
    .execute();
  await sql`ALTER TABLE artifacts ADD CONSTRAINT fk_artifacts_current_version
    FOREIGN KEY (current_version_id) REFERENCES artifact_versions(id) ON DELETE SET NULL`.execute(db);

  await db.schema
    .alterTable("space_file_snapshots")
    .addColumn("unavailable_at", "timestamptz")
    .addColumn("purged_at", "timestamptz")
    .execute();

  // People's uploads and edits hold the space like a run does, without a job.
  await db.schema.alterTable("space_file_state").addColumn("lease_operation_id", "varchar(64)").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("space_file_state").dropColumn("lease_operation_id").execute();
  await db.schema.alterTable("space_file_snapshots").dropColumn("unavailable_at").dropColumn("purged_at").execute();
  await sql`ALTER TABLE artifacts DROP CONSTRAINT fk_artifacts_current_version`.execute(db);
  await db.schema.dropTable("artifact_versions").execute();
  await db.schema.dropTable("artifacts").execute();
}
