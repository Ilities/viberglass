/**
 * In-process per-session async mutex. Serializes read-modify-write flows
 * (reply / sendMessage / approve / cancel / worker event ingest) so event
 * sequence allocation and turn state stay consistent under concurrent
 * requests from multiple users.
 *
 * Per-process by design, matching the single-replica backend assumption
 * (see SessionPresenceService). The UNIQUE(session_id, sequence) index on
 * agent_session_events is the database-level backstop.
 */
export class AgentSessionMutex {
  private readonly tails = new Map<string, Promise<void>>();

  async runExclusive<T>(
    sessionId: string,
    fn: () => Promise<T>,
  ): Promise<T> {
    const previous = this.tails.get(sessionId) ?? Promise.resolve();
    const result = previous.then(fn);
    const tail: Promise<void> = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(sessionId, tail);
    try {
      return await result;
    } finally {
      if (this.tails.get(sessionId) === tail) {
        this.tails.delete(sessionId);
      }
    }
  }
}

/**
 * Shared instance — every session mutation path (interaction routes and
 * worker event ingest alike) must serialize through the same mutex.
 */
export const agentSessionMutex = new AgentSessionMutex();
