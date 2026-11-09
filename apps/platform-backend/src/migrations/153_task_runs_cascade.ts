import { sql, type Kysely } from "kysely";
import type { Database } from "../persistence/types/database";

/** A task's runs go with the task, with their manifests, logs and progress. */
export async function up(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_ticket_id_fkey`.execute(db);
  await sql`ALTER TABLE jobs ADD CONSTRAINT jobs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE`.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_ticket_id_fkey`.execute(db);
  await sql`ALTER TABLE jobs ADD CONSTRAINT jobs_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL`.execute(db);
}
