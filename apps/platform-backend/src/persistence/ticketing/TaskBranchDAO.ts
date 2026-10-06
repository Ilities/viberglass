import type { PartRange } from "@viberglass/types";
import db from "../config/database";

/** The branch of each of a task's pull requests, named once when a build or a take-over first needs it. */
export class TaskBranchDAO {
  async get(ticketId: string): Promise<string | null> {
    const row = await db
      .selectFrom("task_pull_requests")
      .select("branch")
      .where("ticket_id", "=", ticketId)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    return row?.branch ?? null;
  }

  /**
   * The branch work on the task goes to: its latest pull request's, until that
   * is merged or closed; then a new branch for `parts`, named `name`, or
   * `name-2` and so on when that's taken.
   */
  async claim(ticketId: string, name: string, parts: PartRange): Promise<string> {
    return db.transaction().execute(async (trx) => {
      // Locks the task, so two builds starting at once agree on one branch.
      await trx.selectFrom("tickets").select("id").where("id", "=", ticketId).forUpdate().executeTakeFirst();
      const latest = await trx
        .selectFrom("task_pull_requests as p")
        .leftJoin("pull_request_outcomes as o", "o.pull_request_url", "p.url")
        .select(["p.branch", "o.state"])
        .where("p.ticket_id", "=", ticketId)
        .orderBy("p.created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      if (latest && latest.state !== "merged" && latest.state !== "closed") return latest.branch;

      const taken = new Set(
        (await trx.selectFrom("task_pull_requests").select("branch").where("ticket_id", "=", ticketId).execute()).map((row) => row.branch),
      );
      let branch = name;
      for (let suffix = 2; taken.has(branch); suffix++) branch = `${name}-${suffix}`;
      await trx
        .insertInto("task_pull_requests")
        .values({ ticket_id: ticketId, branch, first_part: parts.first, last_part: parts.last })
        .execute();
      return branch;
    });
  }
}
