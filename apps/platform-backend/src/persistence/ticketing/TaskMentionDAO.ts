import type { TaskPerson } from "@viberglass/types";
import db from "../config/database";

export interface OpenMention {
  person: TaskPerson;
  at: string;
}

/** Mentions on tasks, by people (written with their message) and by the agent with an artifact. */
export class TaskMentionDAO {
  async createForTurn(ticketId: string, agentTurnId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    await db
      .insertInto("task_mentions")
      .values(userIds.map((userId) => ({ ticket_id: ticketId, agent_turn_id: agentTurnId, user_id: userId })))
      .execute();
  }

  /**
   * Mentions someone on the agent's latest artifact while it still waits on
   * the people it mentioned, so a reviewer added after it was written is asked too.
   */
  async mentionOnOpenReview(ticketId: string, userId: string): Promise<boolean> {
    const latest = await db
      .selectFrom("task_mentions")
      .select("agent_turn_id")
      .where("ticket_id", "=", ticketId)
      .where("agent_turn_id", "is not", null)
      .orderBy("created_at", "desc")
      .limit(1)
      .executeTakeFirst();
    const turnId = latest?.agent_turn_id;
    if (!turnId) return false;
    const onTurn = await db
      .selectFrom("task_mentions")
      .select(["user_id", "answered_at"])
      .where("agent_turn_id", "=", turnId)
      .execute();
    const stillOpen = onTurn.some((mention) => mention.answered_at === null);
    if (!stillOpen || onTurn.some((mention) => mention.user_id === userId)) return false;
    await db.insertInto("task_mentions").values({ ticket_id: ticketId, agent_turn_id: turnId, user_id: userId }).execute();
    return true;
  }

  /** Answers the person's open mentions on the task without a reply, as "done" does in a chat app. */
  async markDone(ticketId: string, userId: string): Promise<number> {
    const result = await db
      .updateTable("task_mentions")
      .set({ answered_at: new Date() })
      .where("ticket_id", "=", ticketId)
      .where("user_id", "=", userId)
      .where("answered_at", "is", null)
      .executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** Each task's unanswered mentions, oldest first. */
  async listOpen(ticketIds: string[]): Promise<Map<string, OpenMention[]>> {
    const open = new Map<string, OpenMention[]>();
    if (ticketIds.length === 0) return open;
    const rows = await db
      .selectFrom("task_mentions")
      .innerJoin("users", "users.id", "task_mentions.user_id")
      .select(["task_mentions.ticket_id", "task_mentions.created_at", "users.id", "users.name"])
      .where("task_mentions.ticket_id", "in", ticketIds)
      .where("task_mentions.answered_at", "is", null)
      .orderBy("task_mentions.created_at", "asc")
      .execute();
    for (const row of rows) {
      const list = open.get(row.ticket_id) ?? [];
      list.push({ person: { id: row.id, name: row.name }, at: row.created_at.toISOString() });
      open.set(row.ticket_id, list);
    }
    return open;
  }
}
