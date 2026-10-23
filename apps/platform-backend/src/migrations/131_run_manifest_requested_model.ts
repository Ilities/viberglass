import { Kysely, sql } from "kysely";

// The model a run's runner was set to use, recorded at dispatch. Many harnesses
// never report the model they ran, and a run that fails before the harness
// starts reports nothing, so this is the only model some runs have.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("job_run_manifests").addColumn("requested_model", "text").execute();

  await sql`
    UPDATE job_run_manifests m
    SET requested_model = COALESCE(
      j.bootstrap_payload #>> '{clankerConfig,modelEndpoint,model}',
      j.bootstrap_payload #>> '{clankerConfig,deploymentConfig,agent,model}'
    )
    FROM jobs j
    WHERE j.id = m.job_id
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("job_run_manifests").dropColumn("requested_model").execute();
}
