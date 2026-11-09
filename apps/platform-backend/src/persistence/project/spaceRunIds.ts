import { sql, type Kysely } from "kysely";
import type { Database } from "../types/database";

/**
 * The ids of a space's runs. A task's run is found through its task; a run
 * without one records its space elsewhere: a schedule's run as its tenant, a
 * release build in its context and release, and a dispatched run in its manifest.
 */
export function spaceRunIds(db: Kysely<Database>, projectId: string) {
  return db
    .selectFrom("jobs")
    .leftJoin("tickets", "tickets.id", "jobs.ticket_id")
    .select("jobs.id")
    .where((eb) =>
      eb.or([
        eb("tickets.project_id", "=", projectId),
        eb("jobs.tenant_id", "=", projectId),
        eb(sql<string>`jobs.context ->> 'projectId'`, "=", projectId),
        eb("jobs.id", "in", db.selectFrom("job_run_manifests").select("job_id").where("project_id", "=", projectId)),
        eb("jobs.id", "in", db.selectFrom("app_releases").select("job_id").where("project_id", "=", projectId)),
        eb("jobs.id", "in", db.selectFrom("space_file_runs").select("job_id").where("project_id", "=", projectId)),
        eb(
          "jobs.id",
          "in",
          db
            .selectFrom("claw_executions")
            .innerJoin("claw_schedules", "claw_schedules.id", "claw_executions.schedule_id")
            .select("claw_executions.job_id")
            .where("claw_schedules.project_id", "=", projectId),
        ),
      ]),
    );
}
