import type {
  AgentSession,
  AgentSessionDAO,
} from "../../persistence/agentSession/AgentSessionDAO";
import type { AgentTurnDAO } from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_PENDING_REQUEST_TYPE,
  AGENT_TURN_ROLE,
  AGENT_TURN_STATUS,
  type AgentSessionStatus,
} from "../../types/agentSession";
import {
  AGENT_SESSION_SERVICE_ERROR_CODE,
  AgentSessionServiceError,
} from "../errors/AgentSessionServiceError";
import {
  SessionTurnContinuationService,
  type ReplyResult,
} from "./SessionTurnContinuationService";
import { agentSessionMutex } from "./AgentSessionMutex";

export type { ReplyResult };
export type ApproveResult = ReplyResult | { cancelled: true };

export class AgentSessionInteractionService {
  constructor(
    private readonly agentSessionDAO: AgentSessionDAO,
    private readonly agentTurnDAO: AgentTurnDAO,
    private readonly agentSessionEventDAO: AgentSessionEventDAO,
    private readonly agentPendingRequestDAO: AgentPendingRequestDAO,
    private readonly turnContinuationService: SessionTurnContinuationService,
  ) {}

  async reply(
    sessionId: string,
    replyText: string,
    userId?: string,
  ): Promise<ReplyResult> {
    return agentSessionMutex.runExclusive(sessionId, () =>
      this.replyExclusive(sessionId, replyText, userId),
    );
  }

  private async replyExclusive(
    sessionId: string,
    replyText: string,
    userId?: string,
  ): Promise<ReplyResult> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        "Session not found",
      );
    }
    if (session.status !== AGENT_SESSION_STATUS.WAITING_ON_USER) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "Session is not waiting for user input",
      );
    }
    const pendingRequest =
      await this.agentPendingRequestDAO.getOpenBySession(sessionId);
    if (
      !pendingRequest ||
      pendingRequest.requestType !== AGENT_PENDING_REQUEST_TYPE.INPUT
    ) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "No open input request found",
      );
    }

    const resolved = await this.agentPendingRequestDAO.resolve(
      pendingRequest.id,
      {
        responseJson: { replyText },
        resolvedBy: userId,
      },
    );
    if (!resolved) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "Request already resolved by another user",
      );
    }

    const [nextUserSeq, maxSeq] = await Promise.all([
      this.agentTurnDAO.nextSequence(sessionId),
      this.agentSessionEventDAO.getMaxSequence(sessionId),
    ]);

    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: nextUserSeq,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: replyText,
      userId: userId ?? null,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: maxSeq + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: replyText },
      userId: userId ?? null,
    });

    return this.launchPending(session, { clearPendingRequest: true });
  }

  /**
   * Send a free-form follow-up message to an active session (no pending
   * request required). In multiplayer sessions the message may arrive
   * while a turn is in flight — it is then queued and batched into the
   * next continuation turn when the current one ends.
   */
  async sendMessage(
    sessionId: string,
    messageText: string,
    userId?: string,
    userName?: string,
  ): Promise<ReplyResult> {
    return agentSessionMutex.runExclusive(sessionId, () =>
      this.sendMessageExclusive(sessionId, messageText, userId, userName),
    );
  }

  private async sendMessageExclusive(
    sessionId: string,
    messageText: string,
    userId?: string,
    userName?: string,
  ): Promise<ReplyResult> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        "Session not found",
      );
    }
    const BLOCKED_STATUSES_MSG = new Set<AgentSessionStatus>([
      AGENT_SESSION_STATUS.COMPLETED,
      AGENT_SESSION_STATUS.CANCELLED,
      AGENT_SESSION_STATUS.WAITING_ON_APPROVAL,
    ]);
    if (BLOCKED_STATUSES_MSG.has(session.status)) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        `Session cannot accept messages in status: ${session.status}`,
      );
    }

    // Multiplayer attribution: the agent (and transcript) see who said what
    const content = userName ? `[${userName}]: ${messageText}` : messageText;

    const [nextUserSeq, maxSeq] = await Promise.all([
      this.agentTurnDAO.nextSequence(sessionId),
      this.agentSessionEventDAO.getMaxSequence(sessionId),
    ]);

    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: nextUserSeq,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: content,
      userId: userId ?? null,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: maxSeq + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content },
      userId: userId ?? null,
    });

    const inFlightTurn =
      await this.agentTurnDAO.getInFlightAssistantTurn(sessionId);
    if (inFlightTurn) {
      // Queued: the running turn's completion will batch this message in
      return {
        currentTurn: inFlightTurn,
        job: { id: inFlightTurn.jobId, status: "queued" },
      };
    }

    return this.launchPending(session);
  }

  async approve(
    sessionId: string,
    approved: boolean,
    userId?: string,
  ): Promise<ApproveResult> {
    return agentSessionMutex.runExclusive(sessionId, () =>
      this.approveExclusive(sessionId, approved, userId),
    );
  }

  private async approveExclusive(
    sessionId: string,
    approved: boolean,
    userId?: string,
  ): Promise<ApproveResult> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        "Session not found",
      );
    }
    if (session.status !== AGENT_SESSION_STATUS.WAITING_ON_APPROVAL) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "Session is not waiting for approval",
      );
    }
    const pendingRequest =
      await this.agentPendingRequestDAO.getOpenBySession(sessionId);
    if (
      !pendingRequest ||
      pendingRequest.requestType !== AGENT_PENDING_REQUEST_TYPE.APPROVAL
    ) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "No open approval request found",
      );
    }

    const resolved = await this.agentPendingRequestDAO.resolve(
      pendingRequest.id,
      {
        responseJson: { approved },
        resolvedBy: userId,
      },
    );
    if (!resolved) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "Request already resolved by another user",
      );
    }

    const [nextUserSeq, maxSeq] = await Promise.all([
      this.agentTurnDAO.nextSequence(sessionId),
      this.agentSessionEventDAO.getMaxSequence(sessionId),
    ]);

    let nextSeq = maxSeq + 1;
    await this.agentSessionEventDAO.create({
      sessionId,
      sequence: nextSeq++,
      eventType: AGENT_SESSION_EVENT_TYPE.APPROVAL_RESOLVED,
      payloadJson: { approved },
      userId: userId ?? null,
    });

    if (!approved) {
      if (session.lastTurnId) {
        await this.agentTurnDAO.update(session.lastTurnId, {
          status: AGENT_TURN_STATUS.CANCELLED,
        });
      }
      await this.agentSessionEventDAO.create({
        sessionId,
        sequence: nextSeq++,
        eventType: AGENT_SESSION_EVENT_TYPE.TURN_FAILED,
        payloadJson: { reason: "Approval rejected" },
      });
      await this.agentSessionEventDAO.create({
        sessionId,
        sequence: nextSeq,
        eventType: AGENT_SESSION_EVENT_TYPE.SESSION_FAILED,
        payloadJson: { reason: "Approval rejected" },
      });
      await this.agentSessionDAO.update(sessionId, {
        status: AGENT_SESSION_STATUS.FAILED,
        completedAt: new Date(),
      });
      return { cancelled: true };
    }

    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: nextUserSeq,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: "Approval granted",
      userId: userId ?? null,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: nextSeq++,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: "Approval granted" },
      userId: userId ?? null,
    });

    return this.launchPending(session, { clearPendingRequest: true });
  }

  private async launchPending(
    session: AgentSession,
    options?: { clearPendingRequest?: boolean },
  ): Promise<ReplyResult> {
    const launched =
      await this.turnContinuationService.launchForPendingMessages(
        session,
        options,
      );
    if (!launched) {
      // Invariant: callers always create a user turn immediately before
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "No pending messages to launch",
      );
    }
    return launched;
  }
}
