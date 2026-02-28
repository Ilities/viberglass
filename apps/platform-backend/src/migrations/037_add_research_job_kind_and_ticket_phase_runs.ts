import { Kysely, sql } from "kysely";
import { Database } from "../persistence/types/database";

export async function up(db: Kysely<Database>): Promise<void> {
  await db.schema
    .alterTable("jobs")
    .addColumn("job_kind", "varchar(20)", (col) =>
      col.notNull().defaultTo("execution"),
    )
    .execute();

  await sql`
    ALTER TABLE jobs
    ADD CONSTRAINT jobs_job_kind_check
    CHECK (job_kind IN ('research', 'execution'))
  `.execute(db);

  await db.schema
    .createTable("ticket_phase_runs")
    .addColumn("id", "uuid", (col) =>
      col.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("ticket_id", "uuid", (col) =>
      col.notNull().references("tickets.id").onDelete("cascade"),
    )
    .addColumn("phase", "varchar(20)", (col) => col.notNull())
    .addColumn("job_id", "varchar(255)", (col) =>
      col.notNull().references("jobs.id").onDelete("cascade"),
    )
    .addColumn("clanker_id", "uuid", (col) =>
      col.notNull().references("clankers.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    ALTER TABLE ticket_phase_runs
    ADD CONSTRAINT ticket_phase_runs_phase_check
    CHECK (phase IN ('research'))
  `.execute(db);

  await db.schema
    .createIndex("idx_ticket_phase_runs_ticket_phase_created")
    .on("ticket_phase_runs")
    .columns(["ticket_id", "phase", "created_at"])
    .execute();

  await db.schema
    .createIndex("idx_ticket_phase_runs_job_id")
    .on("ticket_phase_runs")
    .column("job_id")
    .unique()
    .execute();
}

export async function down(db: Kysely<Database>): Promise<void> {
  await db.schema.dropTable("ticket_phase_runs").execute();

  await sql`
    ALTER TABLE jobs
    DROP CONSTRAINT IF EXISTS jobs_job_kind_check
  `.execute(db);

  await db.schema.alterTable("jobs").dropColumn("job_kind").execute();
}
