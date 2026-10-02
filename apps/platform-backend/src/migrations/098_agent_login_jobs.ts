import { Kysely, sql } from "kysely";

const JOB_KINDS_BEFORE = "'research', 'planning', 'execution', 'reply', 'claw'";
const JOB_KINDS_AFTER = `${JOB_KINDS_BEFORE}, 'agent_login'`;

/**
 * Login-only jobs sign a runner's agent in (a ChatGPT login for Codex) without a
 * repository. The login they store is a secret the platform manages, marked by
 * `purpose` so secret pickers leave it out.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check`.execute(db);
  await sql.raw(`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN (${JOB_KINDS_AFTER}))`).execute(db);

  await sql`ALTER TABLE secrets ADD COLUMN purpose varchar(50)`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE secrets DROP COLUMN purpose`.execute(db);

  await db.deleteFrom("jobs").where("job_kind", "=", "agent_login").execute();
  await sql`ALTER TABLE jobs DROP CONSTRAINT IF EXISTS jobs_job_kind_check`.execute(db);
  await sql.raw(`ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check CHECK (job_kind IN (${JOB_KINDS_BEFORE}))`).execute(db);
}
