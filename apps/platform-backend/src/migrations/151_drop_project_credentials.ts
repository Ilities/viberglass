import { Kysely, sql } from "kysely";

// Connections hold credentials; nothing reads or writes a space's own.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE projects DROP COLUMN IF EXISTS credentials`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE projects ADD COLUMN IF NOT EXISTS credentials jsonb`.execute(db);
}
