import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

const JOB_KINDS_BEFORE = "'planning', 'execution', 'reply', 'claw', 'agent_login'";
const JOB_KINDS_AFTER = `${JOB_KINDS_BEFORE}, 'build_release'`;

/**
 * Release builds run on a runner the platform owns, marked by `purpose` so
 * runner lists and agent pickers leave it out.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check`.execute(db);
  await sql.raw(`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN (${JOB_KINDS_AFTER}))`).execute(db);

  await sql`ALTER TABLE clankers ADD COLUMN purpose varchar(50) CHECK (purpose IN ('app_builder'))`.execute(db);
  await sql`CREATE UNIQUE INDEX clankers_one_per_purpose ON clankers (purpose) WHERE purpose IS NOT NULL AND deleted_at IS NULL`.execute(db);

  await db.schema.createTable("app_releases")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("commit_sha", "varchar(40)", (column) => column.notNull())
    .addColumn("status", "varchar(20)", (column) => column.notNull().defaultTo("building").check(sql`status IN ('building', 'ready', 'failed')`))
    .addColumn("job_id", "varchar(255)", (column) => column.references("jobs.id").onDelete("set null"))
    .addColumn("bundle_sha256", "varchar(64)")
    .addColumn("bundle_bytes", "bigint")
    .addColumn("node_version", "varchar(40)")
    .addColumn("build_log", "text")
    .addColumn("failure_reason", "text")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .execute();
  await db.schema.createIndex("app_releases_project_commit").on("app_releases").columns(["project_id", "commit_sha"]).unique().execute();
  await db.schema.createIndex("app_releases_project_created").on("app_releases").columns(["project_id", "created_at"]).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("app_releases").execute();
  await sql`DROP INDEX IF EXISTS clankers_one_per_purpose`.execute(db);
  await sql`ALTER TABLE clankers DROP COLUMN purpose`.execute(db);

  await db.deleteFrom("jobs").where("job_kind", "=", "build_release").execute();
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check`.execute(db);
  await sql.raw(`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN (${JOB_KINDS_BEFORE}))`).execute(db);
}
