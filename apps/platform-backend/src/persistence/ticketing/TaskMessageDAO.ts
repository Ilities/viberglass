import type { TaskMessage } from "@viberglass/types";
import db from "../config/database";

function selectMessages() {
  return db
    .selectFrom("task_messages")
    .leftJoin("users", "users.id", "task_messages.author_id")
    .select([
      "task_messages.id",
      "task_messages.ticket_id",
      "task_messages.body_markdown",
      "task_messages.created_at",
      "task_messages.edited_at",
      "task_messages.external_author_name",
      "task_messages.external_source",
      "users.id as author_id",
      "users.name as author_name",
    ]);
}

type MessageRow = Awaited<ReturnType<ReturnType<typeof selectMessages>["executeTakeFirstOrThrow"]>>;

function toMessage(row: MessageRow): TaskMessage {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    author: row.author_id && row.author_name ? { id: row.author_id, name: row.author_name } : null,
    externalAuthor: row.external_author_name && row.external_source ? { name: row.external_author_name, source: row.external_source } : null,
    source: row.external_source,
    body: row.body_markdown,
    createdAt: row.created_at.toISOString(),
    editedAt: row.edited_at ? row.edited_at.toISOString() : null,
  };
}

export class TaskMessageDAO {
  async list(ticketId: string): Promise<TaskMessage[]> {
    const rows = await selectMessages()
      .where("task_messages.ticket_id", "=", ticketId)
      .orderBy("task_messages.created_at", "asc")
      .execute();
    return rows.map(toMessage);
  }

  async getById(id: string): Promise<TaskMessage | null> {
    const row = await selectMessages().where("task_messages.id", "=", id).executeTakeFirst();
    return row ? toMessage(row) : null;
  }

  /**
   * Stores the message and who it mentions in one transaction; returns its id.
   * Posting answers the author's own open mentions on the task, as replying does in a chat.
   */
  async create(input: {
    ticketId: string;
    authorId: string | null;
    body: string;
    mentionedUserIds: string[];
    /** The tracker it was written in, and who wrote it when they have no account. */
    external?: { source: string; authorName: string | null };
  }): Promise<string> {
    return db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto("task_messages")
        .values({
          ticket_id: input.ticketId,
          author_id: input.authorId,
          body_markdown: input.body,
          external_source: input.external?.source ?? null,
          external_author_name: input.external?.authorName ?? null,
        })
        .returning(["id", "created_at"])
        .executeTakeFirstOrThrow();
      if (input.authorId) {
        await trx
          .updateTable("task_mentions")
          .set({ answered_at: row.created_at })
          .where("ticket_id", "=", input.ticketId)
          .where("user_id", "=", input.authorId)
          .where("answered_at", "is", null)
          .execute();
      }
      if (input.mentionedUserIds.length > 0) {
        await trx
          .insertInto("task_mentions")
          .values(input.mentionedUserIds.map((userId) => ({ ticket_id: input.ticketId, message_id: row.id, user_id: userId })))
          .execute();
      }
      return row.id;
    });
  }

  /** Where the messages an agent turn answered were written: a tracker's name, or null for Viberglass and Slack. */
  async sourcesAnsweredBy(agentTurnId: string): Promise<Array<string | null>> {
    const rows = await db
      .selectFrom("agent_turns")
      .innerJoin("task_messages", "task_messages.id", "agent_turns.task_message_id")
      .select("task_messages.external_source")
      .where("agent_turns.consumed_by_turn_id", "=", agentTurnId)
      .execute();
    return rows.map((row) => row.external_source);
  }
}
