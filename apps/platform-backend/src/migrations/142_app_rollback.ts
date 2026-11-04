import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Rolling an app back to an earlier release, optionally with that release's
 * data, and removing old bundles and backups from storage.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("app_data_backups")
    .addColumn("from_release_id", "uuid", (column) => column.references("app_releases.id").onDelete("set null"))
    .execute();
  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback'))`.execute(db);
  await db.schema.createIndex("app_data_backups_from_release").on("app_data_backups").columns(["from_release_id", "created_at"]).execute();

  await db.schema.alterTable("app_releases")
    .addColumn("rolled_back_at", "timestamptz")
    .addColumn("bundle_removed_at", "timestamptz")
    .addColumn("bundle_purged_at", "timestamptz")
    .execute();

  await db.schema.alterTable("apps")
    .addColumn("rollback_release_id", "uuid", (column) => column.references("app_releases.id").onDelete("set null"))
    .addColumn("rollback_backup_id", "uuid", (column) => column.references("app_data_backups.id").onDelete("set null"))
    .addColumn("rollback_by", "uuid", (column) => column.references("users.id").onDelete("set null"))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("apps").dropColumn("rollback_release_id").dropColumn("rollback_backup_id").dropColumn("rollback_by").execute();
  await db.schema.alterTable("app_releases").dropColumn("rolled_back_at").dropColumn("bundle_removed_at").dropColumn("bundle_purged_at").execute();
  await db.schema.dropIndex("app_data_backups_from_release").execute();
  await db.deleteFrom("app_data_backups").where("reason", "=", "rollback").execute();
  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release'))`.execute(db);
  await db.schema.alterTable("app_data_backups").dropColumn("from_release_id").execute();
}
