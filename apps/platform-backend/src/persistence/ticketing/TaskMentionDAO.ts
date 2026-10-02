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
