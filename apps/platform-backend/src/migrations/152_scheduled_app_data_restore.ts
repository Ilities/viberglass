import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * A schedule can put an App space's data back to a backup, and a maintainer
 * can take a backup by hand. A backup a schedule points at can't be deleted
 * while the schedule exists; NO ACTION rather than RESTRICT, so deleting the
 * space, which takes both, still works.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("claw_schedules")
    .addColumn("backup_id", "uuid", (column) => column.references("app_data_backups.id").onDelete("no action"))
    .execute();
  await db.schema.createIndex("claw_schedules_backup").on("claw_schedules").column("backup_id").where(sql.ref("backup_id"), "is not", null).execute();
  await sql`ALTER TABLE claw_schedules DROP CONSTRAINT IF EXISTS claw_schedules_action_check`.execute(db);
  await sql`ALTER TABLE claw_schedules ADD CONSTRAINT claw_schedules_action_check CHECK (action IN ('run_template', 'app_start', 'app_stop', 'app_restore_data'))`.execute(db);
  await sql`ALTER TABLE claw_schedules ADD CONSTRAINT claw_schedules_backup_for_action CHECK ((action = 'app_restore_data') = (backup_id IS NOT NULL))`.execute(db);

  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback', 'archive', 'eject', 'manual'))`.execute(db);

  await db.schema
    .alterTable("apps")
    .addColumn("restore_backup_id", "uuid", (column) => column.references("app_data_backups.id").onDelete("set null"))
    .addColumn("restore_execution_id", "uuid", (column) => column.references("claw_executions.id").onDelete("set null"))
    .addColumn("backup_due", "boolean", (column) => column.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.alterTable("apps").dropColumn("restore_backup_id").dropColumn("restore_execution_id").dropColumn("backup_due").execute();

  await db.deleteFrom("claw_schedules").where("action", "=", "app_restore_data").execute();
  await sql`ALTER TABLE claw_schedules DROP CONSTRAINT IF EXISTS claw_schedules_backup_for_action`.execute(db);
  await sql`ALTER TABLE claw_schedules DROP CONSTRAINT IF EXISTS claw_schedules_action_check`.execute(db);
  await sql`ALTER TABLE claw_schedules ADD CONSTRAINT claw_schedules_action_check CHECK (action IN ('run_template', 'app_start', 'app_stop'))`.execute(db);
  await db.schema.dropIndex("claw_schedules_backup").execute();
  await db.schema.alterTable("claw_schedules").dropColumn("backup_id").execute();

  await db.deleteFrom("app_data_backups").where("reason", "=", "manual").execute();
  await sql`ALTER TABLE app_data_backups DROP CONSTRAINT IF EXISTS app_data_backups_reason_check`.execute(db);
  await sql`ALTER TABLE app_data_backups ADD CONSTRAINT app_data_backups_reason_check CHECK (reason IN ('release', 'rollback', 'archive', 'eject'))`.execute(db);
}
