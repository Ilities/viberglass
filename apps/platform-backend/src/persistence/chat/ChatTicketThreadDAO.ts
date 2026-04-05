import type { Selectable } from "kysely";
import db from "../config/database";
import type { Database } from "../types/database";

type ChatTicketThreadRow = Selectable<Database["chat_ticket_threads"]>;

export interface ChatTicketThread {
  id: string;
  ticketId: string;
  threadId: string;
  channelId: string;
  adapterName: string;
  clankerId: string;
  mode: string;
  createdAt: Date;
}

export class ChatTicketThreadDAO {
  async link(
    ticketId: string,
    threadId: string,
    channelId: string,
    adapterName: string,
    clankerId: string,
    mode: string,
  ): Promise<ChatTicketThread> {
    const row = await db
      .insertInto("chat_ticket_threads")
      .values({
        ticket_id: ticketId,
        thread_id: threadId,
        channel_id: channelId,
        adapter_name: adapterName,
        clanker_id: clankerId,
        mode,
      })
      .onConflict((oc) =>
        oc
          .column("ticket_id")
          .doUpdateSet({
            thread_id: threadId,
            channel_id: channelId,
            adapter_name: adapterName,
            clanker_id: clankerId,
            mode,
          }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.mapRow(row);
  }

  async getByTicketId(ticketId: string): Promise<ChatTicketThread | null> {
    const row = await db
      .selectFrom("chat_ticket_threads")
      .selectAll()
      .where("ticket_id", "=", ticketId)
      .executeTakeFirst();
    return row ? this.mapRow(row) : null;
  }

  async getByThreadId(threadId: string): Promise<ChatTicketThread | null> {
    const row = await db
      .selectFrom("chat_ticket_threads")
      .selectAll()
      .where("thread_id", "=", threadId)
      .executeTakeFirst();
    return row ? this.mapRow(row) : null;
  }

  async listAll(): Promise<ChatTicketThread[]> {
    const rows = await db
      .selectFrom("chat_ticket_threads")
      .selectAll()
      .execute();
    return rows.map((row) => this.mapRow(row));
  }

  private mapRow(row: ChatTicketThreadRow): ChatTicketThread {
    return {
      id: row.id,
      ticketId: row.ticket_id,
      threadId: row.thread_id,
      channelId: row.channel_id,
      adapterName: row.adapter_name,
      clankerId: row.clanker_id,
      mode: row.mode,
      createdAt: row.created_at,
    };
  }
}
