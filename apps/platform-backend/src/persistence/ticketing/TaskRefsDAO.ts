import db from "../config/database";

/** Tasks' keys and titles by id, for linking to them. */
export class TaskRefsDAO {
  async refsFor(ticketIds: string[]): Promise<Map<string, { key: string; title: string }>> {
    if (ticketIds.length === 0) return new Map();
    const rows = await db.selectFrom("tickets").select(["id", "task_key", "title"]).where("id", "in", [...new Set(ticketIds)]).execute();
    return new Map(rows.map((row) => [row.id, { key: row.task_key, title: row.title }]));
  }
}
