import type { TaskPerson } from "@viberglass/types";
import db from "../config/database";

export interface OpenMention {
  id: string;
  person: TaskPerson;
  at: string;
  message: { author: TaskPerson | null; text: string; at: string } | null;
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

  async markOneDone(ticketId: string, userId: string, mentionId: string): Promise<number> {
    const result = await db.updateTable("task_mentions").set({ answered_at: new Date() })
      .where("id", "=", mentionId).where("ticket_id", "=", ticketId).where("user_id", "=", userId).where("answered_at", "is", null).executeTakeFirst();
    return Number(result.numUpdatedRows);
  }

  /** Each task's unanswered mentions, oldest first. */
  async listOpen(ticketIds: string[]): Promise<Map<string, OpenMention[]>> {
    const open = new Map<string, OpenMention[]>();
    if (ticketIds.length === 0) return open;
    const rows = await db
      .selectFrom("task_mentions")
      .innerJoin("users", "users.id", "task_mentions.user_id")
      .leftJoin("task_messages as message", "message.id", "task_mentions.message_id")
      .leftJoin("users as author", "author.id", "message.author_id")
      .select(["task_mentions.id as mention_id", "task_mentions.ticket_id", "task_mentions.created_at", "users.id", "users.name", "message.body_markdown", "message.created_at as message_at", "author.id as author_id", "author.name as author_name"])
      .where("task_mentions.ticket_id", "in", ticketIds)
      .where("task_mentions.answered_at", "is", null)
      .orderBy("task_mentions.created_at", "asc")
      .execute();
    for (const row of rows) {
      const list = open.get(row.ticket_id) ?? [];
      const author = row.author_id && row.author_name ? { id: row.author_id, name: row.author_name } : null;
      const message = row.body_markdown && row.message_at ? { author, text: row.body_markdown, at: row.message_at.toISOString() } : null;
      list.push({ id: row.mention_id, person: { id: row.id, name: row.name }, at: row.created_at.toISOString(), message });
      open.set(row.ticket_id, list);
    }
    return open;
  }
}
