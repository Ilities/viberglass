import db from "../config/database";

/** Reads about a task's builds (its execution runs). */
export class TaskBuildDAO {
  /** When the task's most recent finished build ended; null if none has. */
  async lastBuildFinishedAt(ticketId: string): Promise<Date | null> {
    const row = await db
      .selectFrom("jobs")
      .select("finished_at")
      .where("ticket_id", "=", ticketId)
      .where("job_kind", "=", "execution")
      .where("finished_at", "is not", null)
      .orderBy("finished_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.finished_at ? new Date(row.finished_at) : null;
  }
}
