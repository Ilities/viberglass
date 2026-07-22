import { Kysely, sql } from "kysely";
import type { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("projects")
    .addColumn("archived_at", "timestamp")
    .execute();

  await db.schema
    .createIndex("idx_projects_archived_created")
    .on("projects")
    .columns(["archived_at", "created_at"])
    .execute();

  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check`.execute(db);
  await sql`
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('queued', 'active', 'completed', 'failed', 'cancelled'))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`UPDATE jobs SET status = 'failed' WHERE status = 'cancelled'`.execute(db);
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_status_check`.execute(db);
  await sql`
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_status_check
    CHECK (status IN ('queued', 'active', 'completed', 'failed'))
  `.execute(db);
  await db.schema.dropIndex("idx_projects_archived_created").execute();
  await db.schema.alterTable("projects").dropColumn("archived_at").execute();
}
