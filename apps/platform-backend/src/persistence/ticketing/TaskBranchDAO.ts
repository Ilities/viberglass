import db from "../config/database";

/** The name each task's branch was given, once. */
export class TaskBranchDAO {
  async get(ticketId: string): Promise<string | null> {
    const row = await db.selectFrom("tickets").select("task_branch").where("id", "=", ticketId).executeTakeFirst();
    return row?.task_branch ?? null;
  }

  /** Names the task's branch unless it has a name already; returns the name it has. */
  async claim(ticketId: string, name: string): Promise<string> {
    await db.updateTable("tickets").set({ task_branch: name }).where("id", "=", ticketId).where("task_branch", "is", null).execute();
    return (await this.get(ticketId)) ?? name;
  }
}
