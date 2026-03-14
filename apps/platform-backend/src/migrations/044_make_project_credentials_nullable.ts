import { Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE projects ALTER COLUMN credentials DROP NOT NULL`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`UPDATE projects SET credentials = '{"type":"api_key"}'::jsonb WHERE credentials IS NULL`.execute(
    db,
  );
  await sql`ALTER TABLE projects ALTER COLUMN credentials SET NOT NULL`.execute(
    db,
  );
}
