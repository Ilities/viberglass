import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * One app per App space: whether it should run, what it's doing and which
 * release it serves. `busy_since` marks a start, stop or switch in progress, so
 * only one runs at a time for an app.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_releases")
    .addColumn("went_live_at", "timestamptz")
    .addColumn("live_failure", "text")
    .execute();

  await db.schema.createTable("apps")
    .addColumn("project_id", "uuid", (column) => column.primaryKey().references("projects.id").onDelete("cascade"))
    .addColumn("power", "varchar(10)", (column) => column.notNull().defaultTo("on").check(sql`power IN ('on', 'off')`))
    .addColumn("state", "varchar(20)", (column) =>
      column.notNull().defaultTo("off").check(sql`state IN ('off', 'starting', 'running', 'stopping', 'failed')`))
    .addColumn("status_message", "text")
    .addColumn("current_release_id", "uuid", (column) => column.references("app_releases.id").onDelete("set null"))
    .addColumn("busy_since", "timestamptz")
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();

  await db.schema.createTable("app_data_backups")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("reason", "varchar(20)", (column) => column.notNull().check(sql`reason IN ('release')`))
    .addColumn("release_id", "uuid", (column) => column.references("app_releases.id").onDelete("set null"))
    .addColumn("objects", "integer", (column) => column.notNull())
    .addColumn("bytes", "bigint", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("app_data_backups_project_created").on("app_data_backups").columns(["project_id", "created_at"]).execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("app_data_backups").execute();
  await db.schema.dropTable("apps").execute();
  await db.schema.alterTable("app_releases").dropColumn("went_live_at").dropColumn("live_failure").execute();
}
