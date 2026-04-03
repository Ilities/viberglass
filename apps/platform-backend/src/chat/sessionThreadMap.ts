import { ThreadImpl } from "chat";
import type { Thread } from "chat";
import { ChatSessionThreadDAO } from "../persistence/chat/ChatSessionThreadDAO";
import logger from "../config/logger";

/**
 * Database-backed bidirectional map between agent session IDs and chat threads.
 * Thread objects are cached in-memory; the mapping persists across restarts.
 */

const dao = new ChatSessionThreadDAO();
const threadCache = new Map<string, Thread>();

export async function linkSessionThread(
  sessionId: string,
  thread: Thread,
  adapterName: string,
): Promise<void> {
  const parts = thread.id.split(":");
  const channelId =
    parts.length >= 2 ? parts.slice(0, -1).join(":") : thread.id;
  await dao.link(sessionId, thread.id, channelId, adapterName);
  threadCache.set(sessionId, thread);
}

export async function getThreadForSession(
  sessionId: string,
): Promise<Thread | undefined> {
  const cached = threadCache.get(sessionId);
  if (cached) return cached;
  const row = await dao.getBySessionId(sessionId);
  if (!row) return undefined;
  const thread = rebuildThread(row.threadId, row.channelId, row.adapterName);
  threadCache.set(sessionId, thread);
  return thread;
}

export async function getSessionForThread(
  threadId: string,
): Promise<string | undefined> {
  const row = await dao.getByThreadId(threadId);
  return row?.sessionId;
}

export async function unlinkSession(sessionId: string): Promise<void> {
  threadCache.delete(sessionId);
  try {
    await dao.unlinkBySessionId(sessionId);
  } catch (err) {
    logger.error("Failed to unlink chat session thread", {
      sessionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function rebuildThread(
  threadId: string,
  channelId: string,
  adapterName: string,
): Thread {
  return new ThreadImpl({ adapterName, id: threadId, channelId });
}
