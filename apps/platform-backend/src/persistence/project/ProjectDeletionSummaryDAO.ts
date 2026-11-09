import db from "../config/database";
import { spaceRunIds } from "./spaceRunIds";

/** What permanently deleting a project also deletes. */
export interface ProjectDeletionSummary {
  tickets: number;
  runs: number;
  sessions: number;
  schedules: number;
  /** Set for an App space. */
  app: AppDeletionSummary | null;
}

export interface AppDeletionSummary {
  releases: number;
  backups: number;
  /** The repository that gets archived on its code host. */
  repository: string | null;
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
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("id", "in", spaceRunIds(db, projectId))
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
      app: await this.summarizeApp(projectId),
    };
  }

  private async summarizeApp(projectId: string): Promise<AppDeletionSummary | null> {
    const project = await db.selectFrom("projects").select("backing_kind").where("id", "=", projectId).executeTakeFirst();
    if (project?.backing_kind !== "app") return null;
    const [releases, backups, scm] = await Promise.all([
      db
        .selectFrom("app_releases")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("project_id", "=", projectId)
        .where("preview", "=", false)
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("app_data_backups")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("project_id", "=", projectId)
        .executeTakeFirstOrThrow(),
      db.selectFrom("project_scm_configs").select("source_repository").where("project_id", "=", projectId).executeTakeFirst(),
    ]);
    return { releases: Number(releases.count), backups: Number(backups.count), repository: scm?.source_repository ?? null };
  }
}
