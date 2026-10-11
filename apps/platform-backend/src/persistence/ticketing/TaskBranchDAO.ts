import type { PartRange } from "@viberglass/types";
import db from "../config/database";

const WHOLE_PLAN: PartRange = { first: 1, last: null };

const coversRange = (outer: PartRange, inner: PartRange) =>
  inner.first >= outer.first && (outer.last === null || (inner.last !== null && inner.last <= outer.last));

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
   * is merged or closed, when the build continues it (no `parts`) or it covers
   * `parts` already; else a new branch for `parts`, named `name`, or `name-2`
   * and so on when that's taken. A pull request whose parts were marked
   * finished doesn't cover the next ones, so they get a branch of their own.
   */
  async claim(ticketId: string, name: string, parts: PartRange | null): Promise<string> {
    return db.transaction().execute(async (trx) => {
      // Locks the task, so two builds starting at once agree on one branch.
      await trx.selectFrom("tickets").select("id").where("id", "=", ticketId).forUpdate().executeTakeFirst();
      const latest = await trx
        .selectFrom("task_pull_requests as p")
        .leftJoin("pull_request_outcomes as o", "o.pull_request_url", "p.url")
        .select(["p.branch", "p.first_part", "p.last_part", "o.state"])
        .where("p.ticket_id", "=", ticketId)
        .orderBy("p.created_at", "desc")
        .limit(1)
        .executeTakeFirst();
      const live = latest && latest.state !== "merged" && latest.state !== "closed";
      if (live && (!parts || coversRange({ first: latest.first_part, last: latest.last_part }, parts))) return latest.branch;

      const taken = new Set(
        (await trx.selectFrom("task_pull_requests").select("branch").where("ticket_id", "=", ticketId).execute()).map((row) => row.branch),
      );
      let branch = name;
      for (let suffix = 2; taken.has(branch); suffix++) branch = `${name}-${suffix}`;
      await trx
        .insertInto("task_pull_requests")
        .values({ ticket_id: ticketId, branch, first_part: (parts ?? WHOLE_PLAN).first, last_part: (parts ?? WHOLE_PLAN).last })
        .execute();
      return branch;
    });
  }
}
