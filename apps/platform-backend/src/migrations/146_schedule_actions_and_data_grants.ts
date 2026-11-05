import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/**
 * Schedules can turn an App space's app on or off instead of running a task
 * template. A maintainer can give one agent turn a copy of an app's data.
 */
export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("claw_schedules")
    .addColumn("action", "varchar(20)", (column) => column.notNull().defaultTo("run_template"))
    .execute();
  await sql`ALTER TABLE claw_schedules ALTER COLUMN task_template_id DROP NOT NULL`.execute(db);
  await sql`ALTER TABLE claw_schedules ADD CONSTRAINT claw_schedules_action_check CHECK (action IN ('run_template', 'app_start', 'app_stop'))`.execute(db);
  await sql`ALTER TABLE claw_schedules ADD CONSTRAINT claw_schedules_template_for_action CHECK ((action = 'run_template') = (task_template_id IS NOT NULL))`.execute(db);

  await db.schema
    .createTable("app_data_grants")
    .addColumn("id", "uuid", (column) => column.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("project_id", "uuid", (column) => column.notNull().references("projects.id").onDelete("cascade"))
    .addColumn("ticket_id", "uuid", (column) => column.notNull().references("tickets.id").onDelete("cascade"))
    .addColumn("granted_by", "uuid", (column) => column.references("users.id").onDelete("set null"))
    .addColumn("copied_at", "timestamptz", (column) => column.notNull())
    .addColumn("object_key", "text", (column) => column.notNull())
    .addColumn("bytes", "bigint", (column) => column.notNull())
    .addColumn("turn_id", "uuid", (column) => column.references("agent_turns.id").onDelete("set null"))
    .addColumn("taken_at", "timestamptz")
    .addColumn("removed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) => column.notNull().defaultTo(sql`now()`))
    .execute();
  await sql`CREATE UNIQUE INDEX app_data_grants_one_untaken ON app_data_grants (ticket_id) WHERE taken_at IS NULL AND removed_at IS NULL`.execute(db);
  await sql`CREATE INDEX app_data_grants_kept ON app_data_grants (created_at) WHERE removed_at IS NULL`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("app_data_grants").execute();
  await db.deleteFrom("claw_schedules").where("action", "<>", "run_template").execute();
  await sql`ALTER TABLE claw_schedules DROP CONSTRAINT IF EXISTS claw_schedules_template_for_action`.execute(db);
  await sql`ALTER TABLE claw_schedules DROP CONSTRAINT IF EXISTS claw_schedules_action_check`.execute(db);
  await sql`ALTER TABLE claw_schedules ALTER COLUMN task_template_id SET NOT NULL`.execute(db);
  await db.schema.alterTable("claw_schedules").dropColumn("action").execute();
}
