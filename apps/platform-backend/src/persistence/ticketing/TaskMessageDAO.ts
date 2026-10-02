import type { TaskMessage } from "@viberglass/types";
import db from "../config/database";

export class TaskMessageDAO {
  async list(ticketId: string): Promise<TaskMessage[]> {
    const rows = await db
      .selectFrom("task_messages")
      .leftJoin("users", "users.id", "task_messages.author_id")
      .select([
        "task_messages.id",
        "task_messages.ticket_id",
        "task_messages.body_markdown",
        "task_messages.created_at",
        "task_messages.edited_at",
        "users.id as author_id",
        "users.name as author_name",
      ])
      .where("task_messages.ticket_id", "=", ticketId)
      .orderBy("task_messages.created_at", "asc")
      .execute();
    return rows.map((row) => ({
      id: row.id,
      ticketId: row.ticket_id,
      author: row.author_id && row.author_name ? { id: row.author_id, name: row.author_name } : null,
      body: row.body_markdown,
      createdAt: row.created_at.toISOString(),
      editedAt: row.edited_at ? row.edited_at.toISOString() : null,
    }));
  }

  /**
   * Stores the message and who it mentions in one transaction; returns its id.
   * Posting answers the author's own open mentions on the task, as replying does in a chat.
   */
  async create(input: { ticketId: string; authorId: string; body: string; mentionedUserIds: string[] }): Promise<string> {
    return db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto("task_messages")
        .values({ ticket_id: input.ticketId, author_id: input.authorId, body_markdown: input.body })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();
      await trx
        .updateTable("task_mentions")
        .set({ answered_at: row.created_at })
        .where("ticket_id", "=", input.ticketId)
        .where("user_id", "=", input.authorId)
        .where("answered_at", "is", null)
        .execute();
      if (input.mentionedUserIds.length > 0) {
        await trx
          .insertInto("task_mentions")
          .values(input.mentionedUserIds.map((userId) => ({ ticket_id: input.ticketId, message_id: row.id, user_id: userId })))
          .execute();
      }
      return row.id;
    });
  }
}
