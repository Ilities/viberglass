import db from "../config/database";

/** When each person last read each task's thread, for unread counts. */
export class TaskReadDAO {
  async markRead(ticketId: string, userId: string, at: Date = new Date()): Promise<void> {
    await db
      .insertInto("task_reads")
      .values({ ticket_id: ticketId, user_id: userId, last_read_at: at })
      .onConflict((oc) => oc.columns(["ticket_id", "user_id"]).doUpdateSet({ last_read_at: at }))
      .execute();
  }

  /**
   * Each task's entries by others since the person last read it: messages, and
   * the agent's finished turns. A thread never opened counts everything.
   */
  async unreadCounts(userId: string, ticketIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (ticketIds.length === 0) return counts;
    const messages = db
      .selectFrom("task_messages as m")
      .leftJoin("task_reads as r", (join) => join.onRef("r.ticket_id", "=", "m.ticket_id").on("r.user_id", "=", userId))
      .select(["m.ticket_id", (eb) => eb.fn.countAll<string>().as("unread")])
      .where("m.ticket_id", "in", ticketIds)
      .where((eb) => eb.or([eb("m.author_id", "is", null), eb("m.author_id", "!=", userId)]))
      .where((eb) => eb.or([eb("r.last_read_at", "is", null), eb("m.created_at", ">", eb.ref("r.last_read_at"))]))
      .groupBy("m.ticket_id");
    const turns = db
      .selectFrom("agent_turns as t")
      .innerJoin("agent_sessions as s", "s.id", "t.session_id")
      .leftJoin("task_reads as r", (join) => join.onRef("r.ticket_id", "=", "s.ticket_id").on("r.user_id", "=", userId))
      .select(["s.ticket_id", (eb) => eb.fn.countAll<string>().as("unread")])
      .where("s.ticket_id", "in", ticketIds)
      .where("t.role", "=", "assistant")
      .where("t.action", "is not", null)
      .where("t.status", "in", ["completed", "failed"])
      .where((eb) => eb.or([eb("r.last_read_at", "is", null), eb("t.completed_at", ">", eb.ref("r.last_read_at"))]))
      .groupBy("s.ticket_id");
    for (const row of [...(await messages.execute()), ...(await turns.execute())]) {
      counts.set(row.ticket_id, (counts.get(row.ticket_id) ?? 0) + Number(row.unread));
    }
    return counts;
  }
}
