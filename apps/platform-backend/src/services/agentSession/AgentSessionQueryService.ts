import type { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import type { AgentSession } from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurn } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSessionEvent } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentPendingRequest } from "../../persistence/agentSession/AgentPendingRequestDAO";
import type { AgentSessionMode, AgentSessionStatus } from "../../types/agentSession";

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

  async listEvents(
    sessionId: string,
    options: ListEventsOptions = {},
  ): Promise<AgentSessionEvent[]> {
    return this.agentSessionEventDAO.listBySession(sessionId, {
      afterSequence: options.afterSequence,
      limit: options.limit,
    });
  }
}
