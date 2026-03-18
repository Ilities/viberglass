import type { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSessionDAO } from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import type { JsonObject } from "../../persistence/types/database";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_STATUS,
  AGENT_PENDING_REQUEST_TYPE,
  type AgentSessionEventType,
} from "../../types/agentSession";
import { AgentSessionServiceError, AGENT_SESSION_SERVICE_ERROR_CODE } from "../errors/AgentSessionServiceError";

export interface IngestEvent {
  eventType: AgentSessionEventType;
  payload: JsonObject;
}

export class AgentSessionWorkerEventService {
  constructor(
    private readonly agentSessionEventDAO: AgentSessionEventDAO,
    private readonly agentTurnDAO: AgentTurnDAO,
    private readonly agentSessionDAO: AgentSessionDAO,
    private readonly agentPendingRequestDAO: AgentPendingRequestDAO,
  ) {}

  async batchIngest(jobId: string, events: IngestEvent[]): Promise<void> {
    const turn = await this.agentTurnDAO.getByJobId(jobId);
    if (!turn) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        `No turn found for job ${jobId}`,
        404,
      );
    }

    const sessionId = turn.sessionId;
    const maxSeq = await this.agentSessionEventDAO.getMaxSequence(sessionId);

    const eventInputs = events.map((evt, i) => ({
      sessionId,
      turnId: turn.id,
      jobId,
      sequence: maxSeq + i + 1,
      eventType: evt.eventType,
      payloadJson: evt.payload,
    }));

    await this.agentSessionEventDAO.createMany(eventInputs);

    for (const evt of events) {
      await this.applyEventTransition(sessionId, turn.id, jobId, evt);
    }
  }

  async storeAcpSessionId(jobId: string, acpSessionId: string): Promise<void> {
    const turn = await this.agentTurnDAO.getByJobId(jobId);
    if (!turn) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        `No turn found for job ${jobId}`,
        404,
      );
    }

    const session = await this.agentSessionDAO.getById(turn.sessionId);
    if (!session) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        `Session not found for turn ${turn.id}`,
      );
    }

    const existingMeta =
      session.metadataJson !== null &&
      typeof session.metadataJson === "object" &&
      !Array.isArray(session.metadataJson)
        ? (session.metadataJson as Record<string, unknown>)
        : {};

    await this.agentSessionDAO.update(session.id, {
      metadataJson: { ...existingMeta, acpSessionId },
    });
  }

  private async applyEventTransition(
    sessionId: string,
    turnId: string,
    jobId: string,
    evt: IngestEvent,
  ): Promise<void> {
    switch (evt.eventType) {
      case AGENT_SESSION_EVENT_TYPE.NEEDS_INPUT: {
        const existingInput = await this.agentPendingRequestDAO.getOpenBySession(sessionId);
        if (existingInput) break;
        const prompt =
          typeof evt.payload.prompt === "string" ? evt.payload.prompt : "";
        const req = await this.agentPendingRequestDAO.create({
          sessionId,
          turnId,
          jobId,
          requestType: AGENT_PENDING_REQUEST_TYPE.INPUT,
          promptMarkdown: prompt,
          requestJson: evt.payload,
        });
        await this.agentTurnDAO.update(turnId, {
          status: AGENT_TURN_STATUS.BLOCKED,
        });
        await this.agentSessionDAO.update(sessionId, {
          status: AGENT_SESSION_STATUS.WAITING_ON_USER,
          latestPendingRequestId: req.id,
        });
        break;
      }
      case AGENT_SESSION_EVENT_TYPE.NEEDS_APPROVAL: {
        const existingApproval = await this.agentPendingRequestDAO.getOpenBySession(sessionId);
        if (existingApproval) break;
        const prompt =
          typeof evt.payload.prompt === "string" ? evt.payload.prompt : "";
        const req = await this.agentPendingRequestDAO.create({
          sessionId,
          turnId,
          jobId,
          requestType: AGENT_PENDING_REQUEST_TYPE.APPROVAL,
          promptMarkdown: prompt,
          requestJson: evt.payload,
        });
        await this.agentTurnDAO.update(turnId, {
          status: AGENT_TURN_STATUS.BLOCKED,
        });
        await this.agentSessionDAO.update(sessionId, {
          status: AGENT_SESSION_STATUS.WAITING_ON_APPROVAL,
          latestPendingRequestId: req.id,
        });
        break;
      }
      case AGENT_SESSION_EVENT_TYPE.TURN_COMPLETED:
        await this.agentTurnDAO.update(turnId, {
          status: AGENT_TURN_STATUS.COMPLETED,
          completedAt: new Date(),
        });
        await this.agentSessionDAO.update(sessionId, {
          status: AGENT_SESSION_STATUS.ACTIVE,
        });
        break;
      case AGENT_SESSION_EVENT_TYPE.TURN_FAILED:
        await this.agentTurnDAO.update(turnId, {
          status: AGENT_TURN_STATUS.FAILED,
        });
        // Keep session active so user can retry rather than killing the whole session
        await this.agentSessionDAO.update(sessionId, {
          status: AGENT_SESSION_STATUS.ACTIVE,
        });
        break;
      case AGENT_SESSION_EVENT_TYPE.SESSION_COMPLETED:
        await this.agentTurnDAO.update(turnId, {
          status: AGENT_TURN_STATUS.COMPLETED,
          completedAt: new Date(),
        });
        await this.agentSessionDAO.update(sessionId, {
          status: AGENT_SESSION_STATUS.COMPLETED,
          completedAt: new Date(),
        });
        break;
      case AGENT_SESSION_EVENT_TYPE.SESSION_FAILED:
        await this.agentSessionDAO.update(sessionId, {
          status: AGENT_SESSION_STATUS.FAILED,
          completedAt: new Date(),
        });
        break;
    }
  }
}
