import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

type ChatSessionThreadRow = Selectable<Database["chat_session_threads"]>;

export interface ChatSessionThread {
  id: string;
  sessionId: string;
  threadId: string;
  channelId: string;
  adapterName: string;
  createdAt: Date;
}

export class ChatSessionThreadDAO {
  async link(
    sessionId: string,
    threadId: string,
    channelId: string,
    adapterName: string,
  ): Promise<ChatSessionThread> {
    const row = await db.transaction().execute(async (trx) => {
      // Remove any stale mapping for this thread so a new session can take over
      await trx
        .deleteFrom("chat_session_threads")
        .where("thread_id", "=", threadId)
        .where("session_id", "!=", sessionId)
        .execute();

      return trx
        .insertInto("chat_session_threads")
        .values({
          session_id: sessionId,
          thread_id: threadId,
          channel_id: channelId,
          adapter_name: adapterName,
        })
        .onConflict((oc) =>
          oc
            .column("session_id")
            .doUpdateSet({
              thread_id: threadId,
              channel_id: channelId,
              adapter_name: adapterName,
            }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    });
    return this.mapRow(row);
  }

  async getBySessionId(sessionId: string): Promise<ChatSessionThread | null> {
    const row = await db
      .selectFrom("chat_session_threads")
      .selectAll()
      .where("session_id", "=", sessionId)
      .executeTakeFirst();
    return row ? this.mapRow(row) : null;
  }

  async getByThreadId(threadId: string): Promise<ChatSessionThread | null> {
    const row = await db
      .selectFrom("chat_session_threads")
      .selectAll()
      .where("thread_id", "=", threadId)
      .executeTakeFirst();
    return row ? this.mapRow(row) : null;
  }

  async listAll(): Promise<ChatSessionThread[]> {
    const rows = await db
      .selectFrom("chat_session_threads")
      .selectAll()
      .execute();
    return rows.map((row) => this.mapRow(row));
  }

  async unlinkBySessionId(sessionId: string): Promise<void> {
    await db
      .deleteFrom("chat_session_threads")
      .where("session_id", "=", sessionId)
      .execute();
  }

  private mapRow(row: ChatSessionThreadRow): ChatSessionThread {
    return {
      id: row.id,
      sessionId: row.session_id,
      threadId: row.thread_id,
      channelId: row.channel_id,
      adapterName: row.adapter_name,
      createdAt: row.created_at,
    };
  }
}
