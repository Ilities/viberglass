import type {
  AgentSession,
  AgentSessionDAO,
} from "../../persistence/agentSession/AgentSessionDAO";
import type {
  AgentTurn,
  AgentTurnDAO,
} from "../../persistence/agentSession/AgentTurnDAO";
import type {
  AgentSessionEvent,
  AgentSessionEventDAO,
} from "../../persistence/agentSession/AgentSessionEventDAO";
import type {
  AgentPendingRequest,
  AgentPendingRequestDAO,
} from "../../persistence/agentSession/AgentPendingRequestDAO";
import type { AgentSessionMode, AgentSessionStatus } from "@viberglass/types";
import db from "../../persistence/config/database";

export interface AgentSessionDetail {
  session: AgentSession;
  turns: AgentTurn[];
  latestEvents: AgentSessionEvent[];
  pendingRequest: AgentPendingRequest | null;
}

export interface ListSessionsOptions {
  mode?: AgentSessionMode;
  status?: AgentSessionStatus;
  limit?: number;
}

export interface ListEventsOptions {
  afterSequence?: number;
  limit?: number;
}

export interface SessionParticipant {
  userId: string;
  name: string;
  avatarUrl: string | null;
  lastActiveAt: Date;
}

export class AgentSessionQueryService {
  constructor(
    private readonly agentSessionDAO: AgentSessionDAO,
    private readonly agentTurnDAO: AgentTurnDAO,
    private readonly agentSessionEventDAO: AgentSessionEventDAO,
    private readonly agentPendingRequestDAO: AgentPendingRequestDAO,
  ) {}

  async getDetail(sessionId: string): Promise<AgentSessionDetail | null> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session) {
      return null;
    }

    const [turns, latestEvents, pendingRequest] = await Promise.all([
      this.agentTurnDAO.listBySession(sessionId),
      this.agentSessionEventDAO.listBySession(sessionId, { limit: 50 }),
      this.agentPendingRequestDAO.getOpenBySession(sessionId),
    ]);

    return { session, turns, latestEvents, pendingRequest };
  }

  async listForTicket(
    ticketId: string,
    options: ListSessionsOptions = {},
  ): Promise<AgentSession[]> {
    return this.agentSessionDAO.listByTicket(ticketId, {
      mode: options.mode,
      statuses: options.status ? [options.status] : undefined,
      limit: options.limit,
    });
  }

  async listForProject(
    projectId: string,
    options: { statuses?: AgentSessionStatus[]; limit?: number } = {},
  ): Promise<AgentSession[]> {
    return this.agentSessionDAO.listByProject(projectId, {
      statuses: options.statuses,
      limit: options.limit,
    });
  }

  async listEvents(
    sessionId: string,
    options: ListEventsOptions = {},
  ): Promise<AgentSessionEvent[]> {
    return this.agentSessionEventDAO.listBySession(sessionId, {
      afterSequence: options.afterSequence,
      limit: options.limit,
    });
  }

  async getSessionParticipants(
    sessionId: string,
  ): Promise<SessionParticipant[]> {
    // Get distinct user_ids from user turns, plus the session creator
    const rows = await db
      .selectFrom("agent_turns")
      .innerJoin("users", "users.id", "agent_turns.user_id")
      .select([
        "users.id as userId",
        "users.name",
        "users.avatar_url as avatarUrl",
        db.fn.max("agent_turns.created_at").as("lastActiveAt"),
      ])
      .where("agent_turns.session_id", "=", sessionId)
      .where("agent_turns.role", "=", "user")
      .where("agent_turns.user_id", "is not", null)
      .groupBy(["users.id", "users.name", "users.avatar_url"])
      .execute();

    const participantMap = new Map<string, SessionParticipant>();
    for (const row of rows) {
      participantMap.set(row.userId!, {
        userId: row.userId!,
        name: row.name,
        avatarUrl: row.avatarUrl,
        lastActiveAt: row.lastActiveAt ?? new Date(),
      });
    }

    // Also include the session creator
    const session = await this.agentSessionDAO.getById(sessionId);
    if (session?.createdBy && !participantMap.has(session.createdBy)) {
      const creator = await db
        .selectFrom("users")
        .select(["id", "name", "avatar_url"])
        .where("id", "=", session.createdBy)
        .executeTakeFirst();

      if (creator) {
        participantMap.set(creator.id, {
          userId: creator.id,
          name: creator.name,
          avatarUrl: creator.avatar_url,
          lastActiveAt: session.createdAt,
        });
      }
    }

    return [...participantMap.values()];
  }
}
