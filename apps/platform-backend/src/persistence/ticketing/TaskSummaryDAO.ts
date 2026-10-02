import db from "../config/database";

export interface TaskSummary {
  id: string;
  ticketId: string;
  version: number;
  content: string;
  agentTurnId: string | null;
  createdAt: Date;
}

const toSummary = (row: { id: string; ticket_id: string; version: number; content: string; agent_turn_id: string | null; created_at: Date }): TaskSummary => ({
  id: row.id,
  ticketId: row.ticket_id,
  version: row.version,
  content: row.content,
  agentTurnId: row.agent_turn_id,
  createdAt: row.created_at,
});

/** A task's summaries of its conversation (S6), each a numbered version. */
export class TaskSummaryDAO {
  async create(ticketId: string, content: string, agentTurnId: string | null): Promise<TaskSummary> {
    return db.transaction().execute(async (trx) => {
      // Serialised per task, so two summaries can't take the same number.
      await trx.selectFrom("tickets").select("id").where("id", "=", ticketId).forUpdate().executeTakeFirst();
      const latest = await trx
        .selectFrom("task_summaries")
        .select((eb) => eb.fn.max("version").as("version"))
        .where("ticket_id", "=", ticketId)
        .executeTakeFirst();
      const row = await trx
        .insertInto("task_summaries")
        .values({ ticket_id: ticketId, version: (latest?.version ?? 0) + 1, content, agent_turn_id: agentTurnId })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toSummary(row);
    });
  }

  async latest(ticketId: string): Promise<TaskSummary | null> {
    const row = await db
      .selectFrom("task_summaries")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .orderBy("version", "desc")
      .limit(1)
      .executeTakeFirst();
    return row ? toSummary(row) : null;
  }

  async listForTask(ticketId: string): Promise<TaskSummary[]> {
    const rows = await db.selectFrom("task_summaries").selectAll().where("ticket_id", "=", ticketId).orderBy("version", "asc").execute();
    return rows.map(toSummary);
  }
}
