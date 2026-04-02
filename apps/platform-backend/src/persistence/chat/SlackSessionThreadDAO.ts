import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

type SlackSessionThreadRow = Selectable<Database["slack_session_threads"]>;

export interface SlackSessionThread {
  id: string;
  sessionId: string;
  threadId: string;
  channelId: string;
  createdAt: Date;
}

export class SlackSessionThreadDAO {
  async link(
    sessionId: string,
    threadId: string,
    channelId: string,
  ): Promise<SlackSessionThread> {
    const row = await db.transaction().execute(async (trx) => {
      // Remove any stale mapping for this thread so a new session can take over
      await trx
        .deleteFrom("slack_session_threads")
        .where("thread_id", "=", threadId)
        .where("session_id", "!=", sessionId)
        .execute();

      return trx
        .insertInto("slack_session_threads")
        .values({
          session_id: sessionId,
          thread_id: threadId,
          channel_id: channelId,
        })
        .onConflict((oc) =>
          oc.column("session_id").doUpdateSet({
            thread_id: threadId,
            channel_id: channelId,
          }),
        )
        .returningAll()
        .executeTakeFirstOrThrow();
    });

    return this.mapRow(row);
  }

  async getBySessionId(
    sessionId: string,
  ): Promise<SlackSessionThread | null> {
    const row = await db
      .selectFrom("slack_session_threads")
      .selectAll()
      .where("session_id", "=", sessionId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async getByThreadId(
    threadId: string,
  ): Promise<SlackSessionThread | null> {
    const row = await db
      .selectFrom("slack_session_threads")
      .selectAll()
      .where("thread_id", "=", threadId)
      .executeTakeFirst();

    return row ? this.mapRow(row) : null;
  }

  async listAll(): Promise<SlackSessionThread[]> {
    const rows = await db
      .selectFrom("slack_session_threads")
      .selectAll()
      .execute();
    return rows.map((row) => this.mapRow(row));
  }

  async unlinkBySessionId(sessionId: string): Promise<void> {
    await db
      .deleteFrom("slack_session_threads")
      .where("session_id", "=", sessionId)
      .execute();
  }

  private mapRow(row: SlackSessionThreadRow): SlackSessionThread {
    return {
      id: row.id,
      sessionId: row.session_id,
      threadId: row.thread_id,
      channelId: row.channel_id,
      createdAt: row.created_at,
    };
  }
}
