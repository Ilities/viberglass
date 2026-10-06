import db from "../config/database";

/** A task's pull request and what's known of its state on the SCM. */
export interface TaskPullRequestRow {
  branch: string;
  /** Null while its first build hasn't opened it. */
  url: string | null;
  firstPart: number;
  lastPart: number | null;
  /** Null until it's been checked. */
  state: "open" | "closed" | "merged" | null;
  checkedAt: Date | null;
}

/** A task's pull requests, each on its own branch. */
export class TaskPullRequestDAO {
  /** The tasks still open whose pull request this is. */
  async listOpenTaskIds(pullRequestUrl: string): Promise<string[]> {
    const rows = await db
      .selectFrom("task_pull_requests as p")
      .innerJoin("tickets as t", "t.id", "p.ticket_id")
      .select("t.id")
      .distinct()
      .where("p.url", "=", pullRequestUrl)
      .where("t.ticket_status", "!=", "resolved")
      .execute();
    return rows.map((row) => row.id);
  }

  /** The task's pull requests, oldest first, with their last known state. */
  async listWithStates(ticketId: string): Promise<TaskPullRequestRow[]> {
    const rows = await db
      .selectFrom("task_pull_requests as p")
      .leftJoin("pull_request_outcomes as o", "o.pull_request_url", "p.url")
      .select(["p.branch", "p.url", "p.first_part", "p.last_part", "o.state", "o.checked_at"])
      .where("p.ticket_id", "=", ticketId)
      .orderBy("p.created_at", "asc")
      .execute();
    return rows.map((row) => ({
      branch: row.branch,
      url: row.url,
      firstPart: row.first_part,
      lastPart: row.last_part,
      state: row.state ?? null,
      checkedAt: row.checked_at ?? null,
    }));
  }

  /** The task's opened pull requests, oldest first. */
  async listForTask(ticketId: string): Promise<Array<{ branch: string; url: string; firstPart: number; lastPart: number | null }>> {
    const rows = await this.listWithStates(ticketId);
    return rows.flatMap((row) => (row.url ? [{ branch: row.branch, url: row.url, firstPart: row.firstPart, lastPart: row.lastPart }] : []));
  }

  /**
   * Of these tasks, those whose latest pull request is merged and built only
   * some of the plan: the part it ended at, for saying which part is next.
   */
  async lastMergedParts(ticketIds: string[]): Promise<Map<string, number>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("task_pull_requests as p")
      .innerJoin("pull_request_outcomes as o", "o.pull_request_url", "p.url")
      .select(["p.ticket_id", "p.last_part"])
      .where("p.ticket_id", "in", ticketIds)
      .where("o.state", "=", "merged")
      .where("p.last_part", "is not", null)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom("task_pull_requests as later")
              .select("later.id")
              .whereRef("later.ticket_id", "=", "p.ticket_id")
              .whereRef("later.created_at", ">", "p.created_at")
              // A later part still being built has opened no pull request yet: the merged one is still the latest.
              .where("later.url", "is not", null),
          ),
        ),
      )
      .execute();
    return new Map(rows.flatMap((row) => (row.last_part === null ? [] : [[row.ticket_id, row.last_part] as const])));
  }

  /** Records the pull request a build opened on a branch of the task. */
  async record(ticketId: string, branch: string, url: string): Promise<void> {
    await db
      .insertInto("task_pull_requests")
      .values({ ticket_id: ticketId, branch, url })
      .onConflict((conflict) => conflict.columns(["ticket_id", "branch"]).doUpdateSet({ url, updated_at: new Date() }))
      .execute();
  }
}
