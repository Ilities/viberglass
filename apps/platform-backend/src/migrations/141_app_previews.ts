import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * A change's preview: the change's build running with a fresh copy of the
 * live data, at its own address. Preview builds are kept with releases but
 * apart from them. Sign-ins to a preview only work there.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await addPreviewBuilds(db);

  await db.schema.createTable("app_previews")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("address", "varchar(63)", (column) => column.notNull().unique())
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("ticket_id", "uuid", (column) => column.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("pull_request_url", "text", (column) => column.notNull())
    .addColumn("commit_sha", "varchar(40)", (column) => column.notNull())
    .addColumn("release_id", "uuid", (column) => column.references("app_releases.id").onDelete("set null"))
    .addColumn("running_release_id", "uuid", (column) => column.references("app_releases.id").onDelete("set null"))
    .addColumn("power", "varchar(10)", (column) => column.notNull().defaultTo("on").check(sql`power IN ('on', 'off')`))
    .addColumn("state", "varchar(20)", (column) =>
      column.notNull().defaultTo("off").check(sql`state IN ('off', 'building', 'starting', 'running', 'stopping', 'failed')`))
    .addColumn("status_message", "text")
    .addColumn("busy_since", "timestamptz")
    .addColumn("started_at", "timestamptz")
    .addColumn("last_opened_at", "timestamptz")
    .addColumn("tried_commit_sha", "varchar(40)")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("app_previews_change").on("app_previews").columns(["ticket_id", "pull_request_url"]).unique().execute();

  await db.schema.alterTable("app_handoff_codes")
    .addColumn("preview_id", "uuid", (column) => column.references("app_previews.id").onDelete("cascade"))
    .execute();
  await db.schema.alterTable("app_sessions")
    .addColumn("preview_id", "uuid", (column) => column.references("app_previews.id").onDelete("cascade"))
    .execute();
}

/** The part releases need on their own: a commit is built once for releases and once for previews. */
export async function addPreviewBuilds(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_releases")
    .addColumn("preview", "boolean", (column) => column.notNull().defaultTo(false))
    .execute();
  await db.schema.dropIndex("app_releases_project_commit").execute();
  await db.schema.createIndex("app_releases_project_commit").on("app_releases").columns(["project_id", "commit_sha", "preview"]).unique().execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_sessions").dropColumn("preview_id").execute();
  await db.schema.alterTable("app_handoff_codes").dropColumn("preview_id").execute();
  await db.schema.dropTable("app_previews").execute();
  await db.deleteFrom("app_releases").where("preview", "=", true).execute();
  await db.schema.dropIndex("app_releases_project_commit").execute();
  await db.schema.createIndex("app_releases_project_commit").on("app_releases").columns(["project_id", "commit_sha"]).unique().execute();
  await db.schema.alterTable("app_releases").dropColumn("preview").execute();
}
