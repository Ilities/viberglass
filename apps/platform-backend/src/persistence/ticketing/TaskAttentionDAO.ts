import { sql } from "kysely";
import db from "../config/database";
import type { TaskAttentionTable } from "../types/database";

export interface AttentionDisposition {
  ticketId: string;
  source: string;
  mode: TaskAttentionTable["mode"];
  reason: string | null;
  remindAt: Date | null;
}

/** Personal treatment of a particular request, independent of task status and read position. */
export class TaskAttentionDAO {
  async list(userId: string, ticketIds: string[]): Promise<AttentionDisposition[]> {
    if (!ticketIds.length) return [];
    const rows = await db.selectFrom("task_attention").selectAll().where("user_id", "=", userId).where("ticket_id", "in", ticketIds).execute();
    return rows.map((row) => ({ ticketId: row.ticket_id, source: row.source, mode: row.mode, reason: row.reason, remindAt: row.remind_at }));
  }

  async set(userId: string, ticketId: string, source: string, mode: TaskAttentionTable["mode"], reason: string | null, remindAt: Date | null, questionIds: string[]): Promise<void> {
    const values = { ticket_id: ticketId, user_id: userId, source, mode, reason, remind_at: remindAt, question_ids: questionIds, updated_at: new Date() };
    await db.insertInto("task_attention").values(values).onConflict((conflict) => conflict.columns(["ticket_id", "user_id", "source"]).doUpdateSet(values)).execute();
  }

  async clear(userId: string, ticketId: string, source: string): Promise<void> {
    await db.deleteFrom("task_attention").where("user_id", "=", userId).where("ticket_id", "=", ticketId).where("source", "=", source).execute();
  }

  async defersQuestion(userId: string, ticketId: string, questionId: string, now = new Date()): Promise<boolean> {
    const row = await db.selectFrom("task_attention").select("ticket_id")
      .where("user_id", "=", userId).where("ticket_id", "=", ticketId).where("mode", "in", ["waiting", "later"])
      .where(sql<boolean>`${questionId}::uuid = any(question_ids)`)
      .where((eb) => eb.or([eb("remind_at", "is", null), eb("remind_at", ">", now)]))
      .executeTakeFirst();
    return Boolean(row);
  }
}
