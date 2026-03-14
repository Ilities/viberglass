import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE claw_task_templates ADD COLUMN secret_ids jsonb NOT NULL DEFAULT '[]'::jsonb`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE claw_task_templates DROP COLUMN secret_ids`.execute(db);
}
