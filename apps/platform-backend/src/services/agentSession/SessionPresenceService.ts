import { AGENT_SESSION_EVENT_TYPE } from "../../types/agentSession";

export interface PresenceUser {
  userId: string;
  userName: string;
  avatarUrl: string | null;
}

/** Narrow SSE write channel — express Response satisfies this structurally */
export interface SseConnection {
  write(chunk: string): unknown;
}

interface TrackedPresenceUser extends PresenceUser {
  connectionCount: number;
}

/**
 * Tracks per-session SSE connections and viewer presence in memory.
 * Presence is per-process by design (single-replica backend). Users with
 * multiple open connections (tabs) are ref-counted and only broadcast as
 * left when their last connection closes.
 */
export class SessionPresenceService {
  private readonly connectionsBySession = new Map<
    string,
    Set<SseConnection>
  >();
  private readonly usersBySession = new Map<
    string,
    Map<string, TrackedPresenceUser>
  >();

  registerConnection(
    sessionId: string,
    res: SseConnection,
    user?: PresenceUser,
  ): void {
    let connections = this.connectionsBySession.get(sessionId);
    if (!connections) {
      connections = new Set();
      this.connectionsBySession.set(sessionId, connections);
    }
    connections.add(res);

    if (!user) return;

    let users = this.usersBySession.get(sessionId);
    if (!users) {
      users = new Map();
      this.usersBySession.set(sessionId, users);
    }

    const existing = users.get(user.userId);
    if (existing) {
      existing.connectionCount += 1;
    } else {
      users.set(user.userId, { ...user, connectionCount: 1 });
      this.broadcast(sessionId, {
        id: `join_${user.userId}_${Date.now()}`,
        sessionId,
        turnId: null,
        jobId: null,
        sequence: -1,
        eventType: AGENT_SESSION_EVENT_TYPE.USER_JOINED,
        payloadJson: {
          userId: user.userId,
          userName: user.userName,
          avatarUrl: user.avatarUrl,
        },
        userId: null,
        createdAt: new Date().toISOString(),
      });
    }

    this.broadcastPresenceUpdate(sessionId);
  }

  removeConnection(
    sessionId: string,
    res: SseConnection,
    userId?: string,
  ): void {
    const connections = this.connectionsBySession.get(sessionId);
    if (connections) {
      connections.delete(res);
      if (connections.size === 0) {
        this.connectionsBySession.delete(sessionId);
      }
    }

    if (!userId) return;

    const users = this.usersBySession.get(sessionId);
    const tracked = users?.get(userId);
    if (!users || !tracked) return;

    tracked.connectionCount -= 1;
    if (tracked.connectionCount > 0) return;

    users.delete(userId);
    if (users.size === 0) {
      this.usersBySession.delete(sessionId);
    }

    this.broadcast(sessionId, {
      id: `left_${userId}_${Date.now()}`,
      sessionId,
      turnId: null,
      jobId: null,
      sequence: -1,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_LEFT,
      payloadJson: { userId, userName: tracked.userName },
      userId: null,
      createdAt: new Date().toISOString(),
    });

    this.broadcastPresenceUpdate(sessionId);
  }

  getPresentUsers(sessionId: string): PresenceUser[] {
    const users = this.usersBySession.get(sessionId);
    if (!users) return [];
    return [...users.values()].map(({ userId, userName, avatarUrl }) => ({
      userId,
      userName,
      avatarUrl,
    }));
  }

  private broadcastPresenceUpdate(sessionId: string): void {
    const users = this.usersBySession.get(sessionId);
    if (!users) return;
    this.broadcast(sessionId, {
      id: `presence_${Date.now()}`,
      sessionId,
      turnId: null,
      jobId: null,
      sequence: -1,
      eventType: AGENT_SESSION_EVENT_TYPE.PRESENCE_UPDATE,
      payloadJson: { users: this.getPresentUsers(sessionId) },
      userId: null,
      createdAt: new Date().toISOString(),
    });
  }

  private broadcast(sessionId: string, data: unknown): void {
    const connections = this.connectionsBySession.get(sessionId);
    if (!connections) return;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const res of connections) {
      try {
        res.write(payload);
      } catch {
        // Dead connection — drop it silently; its request close handler
        // performs the presence ref-count cleanup.
        connections.delete(res);
      }
    }
  }
}
