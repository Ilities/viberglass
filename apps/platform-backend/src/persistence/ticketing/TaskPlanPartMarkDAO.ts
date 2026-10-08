import type { TaskPlanPartMark } from "@viberglass/types";
import db from "../config/database";

/** The parts of a task's plan someone marked done or skipped, instead of merging their pull request. */
export class TaskPlanPartMarkDAO {
  async list(ticketId: string): Promise<Map<number, TaskPlanPartMark>> {
    const rows = await db.selectFrom("task_plan_part_marks").select(["part_number", "mark"]).where("ticket_id", "=", ticketId).execute();
    return new Map(rows.map((row) => [row.part_number, row.mark]));
  }

  /** Of these tasks, the parts marked on each. */
  async listFor(ticketIds: string[]): Promise<Map<string, Set<number>>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db.selectFrom("task_plan_part_marks").select(["ticket_id", "part_number"]).where("ticket_id", "in", ticketIds).execute();
    const marked = new Map<string, Set<number>>();
    for (const row of rows) marked.set(row.ticket_id, (marked.get(row.ticket_id) ?? new Set()).add(row.part_number));
    return marked;
  }

  async set(ticketId: string, partNumber: number, mark: TaskPlanPartMark, userId: string | null): Promise<void> {
    await db
      .insertInto("task_plan_part_marks")
      .values({ ticket_id: ticketId, part_number: partNumber, mark, marked_by: userId })
      .onConflict((conflict) => conflict.columns(["ticket_id", "part_number"]).doUpdateSet({ mark, marked_by: userId, created_at: new Date() }))
      .execute();
  }

  async clear(ticketId: string, partNumber: number): Promise<void> {
    await db.deleteFrom("task_plan_part_marks").where("ticket_id", "=", ticketId).where("part_number", "=", partNumber).execute();
  }
}
