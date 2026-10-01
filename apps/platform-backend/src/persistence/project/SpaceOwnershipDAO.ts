import db from "../config/database";

/**
 * Which space a task, session or run belongs to, for access checks. Null when
 * it doesn't exist; a malformed id is left for the route's validation to refuse.
 */
export class SpaceOwnershipDAO {
  async projectIdForTask(ticketId: string): Promise<string | null> {
    if (!UUID.test(ticketId)) return null;
    const row = await db.selectFrom("tickets").select("project_id").where("id", "=", ticketId).executeTakeFirst();
    return row?.project_id ?? null;
  }

  async projectIdForTaskKey(key: string): Promise<string | null> {
    const row = await db.selectFrom("tickets").select("project_id").where("task_key", "=", key).executeTakeFirst();
    return row?.project_id ?? null;
  }

  async projectIdForSession(sessionId: string): Promise<string | null> {
    if (!UUID.test(sessionId)) return null;
    const row = await db.selectFrom("agent_sessions").select("project_id").where("id", "=", sessionId).executeTakeFirst();
    return row?.project_id ?? null;
  }

  async projectIdForSchedule(scheduleId: string): Promise<string | null> {
    if (!UUID.test(scheduleId)) return null;
    const row = await db.selectFrom("claw_schedules").select("project_id").where("id", "=", scheduleId).executeTakeFirst();
    return row?.project_id ?? null;
  }

  async projectIdForTaskTemplate(templateId: string): Promise<string | null> {
    if (!UUID.test(templateId)) return null;
    const row = await db.selectFrom("claw_task_templates").select("project_id").where("id", "=", templateId).executeTakeFirst();
    return row?.project_id ?? null;
  }

  async projectIdForScheduleExecution(executionId: string): Promise<string | null> {
    if (!UUID.test(executionId)) return null;
    const row = await db
      .selectFrom("claw_executions")
      .innerJoin("claw_schedules", "claw_schedules.id", "claw_executions.schedule_id")
      .select("claw_schedules.project_id")
      .where("claw_executions.id", "=", executionId)
      .executeTakeFirst();
    return row?.project_id ?? null;
  }

  /** A run's space is its task's; a run without a task (a schedule's) records its space as `tenant_id`. */
  async projectIdForJob(jobId: string): Promise<string | null> {
    const job = await db
      .selectFrom("jobs")
      .leftJoin("tickets", "tickets.id", "jobs.ticket_id")
      .select(["tickets.project_id", "jobs.tenant_id"])
      .where("jobs.id", "=", jobId)
      .executeTakeFirst();
    if (!job) return null;
    if (job.project_id) return job.project_id;
    if (!UUID.test(job.tenant_id)) return null;
    const project = await db.selectFrom("projects").select("id").where("id", "=", job.tenant_id).executeTakeFirst();
    return project?.id ?? null;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
