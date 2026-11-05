import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/** Archiving an App space turns its app off and keeps one last copy of its data. */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("apps").addColumn("archive_backup_due", "boolean", (column) => column.notNull().defaultTo(false)).execute();
  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback', 'archive'))`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.deleteFrom("app_data_backups").where("reason", "=", "archive").execute();
  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback'))`.execute(db);
  await db.schema.alterTable("apps").dropColumn("archive_backup_due").execute();
}
