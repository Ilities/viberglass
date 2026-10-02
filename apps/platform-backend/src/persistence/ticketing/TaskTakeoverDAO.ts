import type { TaskTakeover } from "@viberglass/types";
import { sql } from "kysely";
import db from "../config/database";

/** Who has taken a task's work over from the agent, while they have it. */
export class TaskTakeoverDAO {
  async set(ticketId: string, userId: string): Promise<void> {
    await db.updateTable("tickets").set({ taken_over_by: userId, taken_over_at: new Date() }).where("id", "=", ticketId).execute();
  }

  async clear(ticketId: string): Promise<void> {
    await db.updateTable("tickets").set({ taken_over_by: null, taken_over_at: null }).where("id", "=", ticketId).execute();
  }

  async get(ticketId: string): Promise<TaskTakeover | null> {
    return (await this.listFor([ticketId])).get(ticketId) ?? null;
  }

  async listFor(ticketIds: string[]): Promise<Map<string, TaskTakeover>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db
      .selectFrom("tickets")
      .innerJoin("users", "users.id", "tickets.taken_over_by")
      .select(["tickets.id", "tickets.taken_over_at", "users.id as user_id", "users.name"])
      .where("tickets.id", "in", ticketIds)
      .execute();
    return new Map(
      rows.flatMap((row) =>
        row.taken_over_at ? [[row.id, { by: { id: row.user_id, name: row.name }, at: row.taken_over_at.toISOString() }]] : [],
      ),
    );
  }

  /** The branch the task's latest build pushed, if one has. */
  async lastBuildBranch(ticketId: string): Promise<string | null> {
    const row = await db
      .selectFrom("jobs")
      .select(sql`result->>'branch'`.as("branch"))
      .where("ticket_id", "=", ticketId)
      .where("job_kind", "=", "execution")
      .where("status", "=", "completed")
      .where(sql`result->>'branch'`, "is not", null)
      .orderBy("finished_at", "desc")
      .executeTakeFirst();
    return typeof row?.branch === "string" ? row.branch : null;
  }
}
