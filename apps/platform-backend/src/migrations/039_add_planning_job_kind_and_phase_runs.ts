import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  // Drop old constraints
  await sql`
    ALTER TABLE jobs
    DROP CONSTRAINT IF EXISTS jobs_job_kind_check
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_runs
    DROP CONSTRAINT IF EXISTS ticket_phase_runs_phase_check
  `.execute(db);

  // Add new constraints with planning support
  await sql`
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_job_kind_check
    CHECK (job_kind IN ('research', 'planning', 'execution'))
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_runs
    ADD CONSTRAINT ticket_phase_runs_phase_check
    CHECK (phase IN ('research', 'planning'))
  `.execute(db);
}

export async function down(db: Kysely<Database>): Promise<void> {
  // Drop new constraints
  await sql`
    ALTER TABLE jobs
    DROP CONSTRAINT IF EXISTS jobs_job_kind_check
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_runs
    DROP CONSTRAINT IF EXISTS ticket_phase_runs_phase_check
  `.execute(db);

  // Restore old constraints
  await sql`
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_job_kind_check
    CHECK (job_kind IN ('research', 'execution'))
  `.execute(db);

  await sql`
    ALTER TABLE ticket_phase_runs
    ADD CONSTRAINT ticket_phase_runs_phase_check
    CHECK (phase IN ('research'))
  `.execute(db);
}
