import { ThreadImpl } from "chat";
import type { Thread } from "chat";
import { ChatTicketThreadDAO } from "../persistence/chat/ChatTicketThreadDAO";

/**
 * Database-backed bidirectional map between ticket IDs and chat threads.
 * Thread objects are cached in-memory; the mapping persists across restarts.
 */

const dao = new ChatTicketThreadDAO();
const threadCache = new Map<string, Thread>();
const ticketCache = new Map<
  string,
  { ticketId: string; clankerId: string; mode: string }
>();

export async function linkTicketThread(
  ticketId: string,
  thread: Thread,
  clankerId: string,
  mode: string,
): Promise<void> {
  const parts = thread.id.split(":");
  const channelId =
    parts.length >= 2 ? parts.slice(0, -1).join(":") : thread.id;
  await dao.link(ticketId, thread.id, channelId, "slack", clankerId, mode);
  threadCache.set(ticketId, thread);
  ticketCache.set(thread.id, { ticketId, clankerId, mode });
}

export async function getTicketForThread(
  threadId: string,
): Promise<{ ticketId: string; clankerId: string; mode: string } | undefined> {
  const cached = ticketCache.get(threadId);
  if (cached) return cached;
  const row = await dao.getByThreadId(threadId);
  if (!row) return undefined;
  const entry = {
    ticketId: row.ticketId,
    clankerId: row.clankerId,
    mode: row.mode,
  };
  ticketCache.set(threadId, entry);
  return entry;
}

export async function getThreadForTicket(
  ticketId: string,
): Promise<Thread | undefined> {
  const cached = threadCache.get(ticketId);
  if (cached) return cached;
  const row = await dao.getByTicketId(ticketId);
  if (!row) return undefined;
  const thread = new ThreadImpl({
    adapterName: row.adapterName,
    id: row.threadId,
    channelId: row.channelId,
  });
  threadCache.set(ticketId, thread);
  return thread;
}
