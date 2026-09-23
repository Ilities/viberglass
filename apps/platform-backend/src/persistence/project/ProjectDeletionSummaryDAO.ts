import db from "../config/database";

/** What permanently deleting a project also deletes. */
export interface ProjectDeletionSummary {
  tickets: number;
  runs: number;
  sessions: number;
  schedules: number;
}

export class ProjectDeletionSummaryDAO {
  async summarize(projectId: string): Promise<ProjectDeletionSummary> {
    const [tickets, runs, sessions, schedules] = await Promise.all([
      db
        .selectFrom("tickets")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("project_id", "=", projectId)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("jobs")
        .innerJoin("tickets", "tickets.id", "jobs.ticket_id")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("tickets.project_id", "=", projectId)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("agent_sessions")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("project_id", "=", projectId)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("claw_schedules")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("project_id", "=", projectId)
        .executeTakeFirstOrThrow(),
    ]);

    return {
      tickets: Number(tickets.count),
      runs: Number(runs.count),
      sessions: Number(sessions.count),
      schedules: Number(schedules.count),
    };
  }
}
