import { ThreadImpl } from "chat";
import type { Thread } from "chat";
import { ChatTicketThreadDAO } from "../persistence/chat/ChatTicketThreadDAO";

/**
 * Database-backed map between tasks and their chat threads. Thread objects
 * are cached in memory; the mapping persists across restarts.
 */

const dao = new ChatTicketThreadDAO();
const threadCache = new Map<string, Thread>();
const ticketCache = new Map<string, string>();

export async function linkTicketThread(ticketId: string, thread: Thread, adapterName: string): Promise<void> {
  const parts = thread.id.split(":");
  const channelId = parts.length >= 2 ? parts.slice(0, -1).join(":") : thread.id;
  await dao.link(ticketId, thread.id, channelId, adapterName);
  threadCache.set(ticketId, thread);
  ticketCache.set(thread.id, ticketId);
}

/** The task a chat thread belongs to, if it's a task's thread. */
export async function getTicketForThread(threadId: string): Promise<string | undefined> {
  const cached = ticketCache.get(threadId);
  if (cached) return cached;
  const row = await dao.getByThreadId(threadId);
  if (!row) return undefined;
  ticketCache.set(threadId, row.ticketId);
  return row.ticketId;
}

export async function getThreadForTicket(ticketId: string): Promise<Thread | undefined> {
  const cached = threadCache.get(ticketId);
  if (cached) return cached;
  const row = await dao.getByTicketId(ticketId);
  if (!row) return undefined;
  const thread = new ThreadImpl({ adapterName: row.adapterName, id: row.threadId, channelId: row.channelId });
  threadCache.set(ticketId, thread);
  return thread;
}
