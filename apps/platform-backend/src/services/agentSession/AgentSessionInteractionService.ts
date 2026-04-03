import { randomUUID } from "crypto";
import logger from "../../config/logger";
import type {
  AgentSession,
  AgentSessionDAO,
} from "../../persistence/agentSession/AgentSessionDAO";
import type {
  AgentTurn,
  AgentTurnDAO,
} from "../../persistence/agentSession/AgentTurnDAO";
import type { AgentSessionEventDAO } from "../../persistence/agentSession/AgentSessionEventDAO";
import type { AgentPendingRequestDAO } from "../../persistence/agentSession/AgentPendingRequestDAO";
import type { CredentialRequirementsService } from "../CredentialRequirementsService";
import type { JobService } from "../JobService";
import type { WorkerExecutionService } from "../../workers";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { getClankerProvisioner } from "../../provisioning/provisioningFactory";
import { InstructionStorageService } from "../instructions/InstructionStorageService";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_PENDING_REQUEST_TYPE,
  AGENT_TURN_ROLE,
  AGENT_TURN_STATUS,
  type AgentSessionStatus,
} from "../../types/agentSession";
import {
  buildBootstrapPayload,
  prepareTicketRunContext,
} from "../ticketRunOrchestration";
import {
  AGENT_SESSION_SERVICE_ERROR_CODE,
  AgentSessionServiceError,
} from "../errors/AgentSessionServiceError";
import type {
  JobData,
  PlanningJobData,
  ResearchJobData,
  TicketJobData,
} from "../../types/Job";
import type { JsonValue } from "../../persistence/types/database";

interface ContinuationExtras {
  task: string;
  [key: string]: unknown;
}

export interface ReplyResult {
  currentTurn: AgentTurn;
  job: { id: string; status: string };
}

export type ApproveResult = ReplyResult | { cancelled: true };

export class AgentSessionInteractionService {
  private readonly projectDAO = new ProjectDAO();
  private readonly projectScmConfigDAO = new ProjectScmConfigDAO();
  private readonly integrationCredentialDAO = new IntegrationCredentialDAO();
  private readonly clankerDAO = new ClankerDAO();
  private readonly provisioningService = getClankerProvisioner();
  private readonly instructionStorageService = new InstructionStorageService();

  constructor(
    private readonly agentSessionDAO: AgentSessionDAO,
    private readonly agentTurnDAO: AgentTurnDAO,
    private readonly agentSessionEventDAO: AgentSessionEventDAO,
    private readonly agentPendingRequestDAO: AgentPendingRequestDAO,
    private readonly jobService: JobService,
    private readonly credentialRequirementsService: CredentialRequirementsService,
    private readonly workerExecutionService: WorkerExecutionService,
  ) {}

  async reply(
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

    await this.agentPendingRequestDAO.resolve(pendingRequest.id, {
      responseJson: { replyText },
      resolvedBy: userId,
    });

    const [lastTurn, maxSeq] = await Promise.all([
      session.lastTurnId
        ? this.agentTurnDAO.getById(session.lastTurnId)
        : Promise.resolve(null),
      this.agentSessionEventDAO.getMaxSequence(sessionId),
    ]);

    const nextUserSeq = (lastTurn?.sequence ?? 0) + 1;
    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: nextUserSeq,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: replyText,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: maxSeq + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: replyText },
    });

    const assistantTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.ASSISTANT,
      sequence: nextUserSeq + 1,
      status: AGENT_TURN_STATUS.QUEUED,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: assistantTurn.id,
      sequence: maxSeq + 2,
      eventType: AGENT_SESSION_EVENT_TYPE.TURN_STARTED,
      payloadJson: { turnId: assistantTurn.id },
    });

    const job = await this.launchContinuationJob(session, assistantTurn, {
      task: replyText,
      replyContent: replyText,
    });

    await this.agentSessionDAO.update(sessionId, {
      status: AGENT_SESSION_STATUS.ACTIVE,
      lastJobId: job.id,
      lastTurnId: assistantTurn.id,
      latestPendingRequestId: null,
    });

    return { currentTurn: assistantTurn, job };
  }

  /**
   * Send a free-form follow-up message to an active session (no pending request required).
   * Used when the user wants to continue the conversation after a turn completes normally.
   */
  async sendMessage(
    sessionId: string,
    messageText: string,
    _userId?: string,
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

    const [lastTurn, maxSeq] = await Promise.all([
      session.lastTurnId
        ? this.agentTurnDAO.getById(session.lastTurnId)
        : Promise.resolve(null),
      this.agentSessionEventDAO.getMaxSequence(sessionId),
    ]);

    const nextUserSeq = (lastTurn?.sequence ?? 0) + 1;
    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: nextUserSeq,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: messageText,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: maxSeq + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: messageText },
    });

    const assistantTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.ASSISTANT,
      sequence: nextUserSeq + 1,
      status: AGENT_TURN_STATUS.QUEUED,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: assistantTurn.id,
      sequence: maxSeq + 2,
      eventType: AGENT_SESSION_EVENT_TYPE.TURN_STARTED,
      payloadJson: { turnId: assistantTurn.id },
    });

    const job = await this.launchContinuationJob(session, assistantTurn, {
      task: messageText,
    });

    await this.agentSessionDAO.update(sessionId, {
      status: AGENT_SESSION_STATUS.ACTIVE,
      lastJobId: job.id,
      lastTurnId: assistantTurn.id,
    });

    return { currentTurn: assistantTurn, job };
  }

  async approve(
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

    await this.agentPendingRequestDAO.resolve(pendingRequest.id, {
      responseJson: { approved },
      resolvedBy: userId,
    });

    const [lastTurn, maxSeq] = await Promise.all([
      session.lastTurnId
        ? this.agentTurnDAO.getById(session.lastTurnId)
        : Promise.resolve(null),
      this.agentSessionEventDAO.getMaxSequence(sessionId),
    ]);

    let nextSeq = maxSeq + 1;
    await this.agentSessionEventDAO.create({
      sessionId,
      sequence: nextSeq++,
      eventType: AGENT_SESSION_EVENT_TYPE.APPROVAL_RESOLVED,
      payloadJson: { approved },
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

    const nextUserSeq = (lastTurn?.sequence ?? 0) + 1;
    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: nextUserSeq,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: "Approval granted",
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: nextSeq++,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: "Approval granted" },
    });

    const assistantTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.ASSISTANT,
      sequence: nextUserSeq + 1,
      status: AGENT_TURN_STATUS.QUEUED,
    });
    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: assistantTurn.id,
      sequence: nextSeq,
      eventType: AGENT_SESSION_EVENT_TYPE.TURN_STARTED,
      payloadJson: { turnId: assistantTurn.id },
    });

    const job = await this.launchContinuationJob(session, assistantTurn, {
      task: "Approval granted",
      approvalGranted: true,
    });

    await this.agentSessionDAO.update(sessionId, {
      status: AGENT_SESSION_STATUS.ACTIVE,
      lastJobId: job.id,
      lastTurnId: assistantTurn.id,
      latestPendingRequestId: null,
    });

    return { currentTurn: assistantTurn, job };
  }

  async cancel(sessionId: string, userId?: string): Promise<void> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_FOUND,
        "Session not found",
      );
    }

    const TERMINAL_STATUSES = new Set<AgentSessionStatus>([
      AGENT_SESSION_STATUS.COMPLETED,
      AGENT_SESSION_STATUS.FAILED,
      AGENT_SESSION_STATUS.CANCELLED,
    ]);
    if (TERMINAL_STATUSES.has(session.status)) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_NOT_IN_EXPECTED_STATE,
        "Session is already in a terminal state",
      );
    }

    if (session.lastTurnId) {
      await this.agentTurnDAO.update(session.lastTurnId, {
        status: AGENT_TURN_STATUS.CANCELLED,
      });
    }

    const maxSeq = await this.agentSessionEventDAO.getMaxSequence(sessionId);
    await this.agentSessionEventDAO.create({
      sessionId,
      sequence: maxSeq + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.SESSION_CANCELLED,
      payloadJson: { cancelledBy: userId ?? null },
    });

    await this.agentSessionDAO.update(sessionId, {
      status: AGENT_SESSION_STATUS.CANCELLED,
      completedAt: new Date(),
    });
  }

  private async launchContinuationJob(
    session: AgentSession,
    assistantTurn: AgentTurn,
    extras: ContinuationExtras,
  ): Promise<{ id: string; status: string }> {
    const { task } = extras;
    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const prepared = await prepareTicketRunContext(
      { projectId: session.projectId, clankerId: session.clankerId, jobId },
      {
        projectDAO: this.projectDAO,
        projectScmConfigDAO: this.projectScmConfigDAO,
        integrationCredentialDAO: this.integrationCredentialDAO,
        clankerDAO: this.clankerDAO,
        provisioningService: this.provisioningService,
        instructionStorageService: this.instructionStorageService,
      },
    );

    const jobData = buildContinuationJobData(jobId, session, task);
    const submitResult = await this.jobService.submitJob(jobData, {
      ticketId: session.ticketId,
      clankerId: session.clankerId,
    });
    jobData.callbackToken = submitResult.callbackToken;

    const requiredCredentials =
      await this.credentialRequirementsService.getRequiredCredentialsForClanker(
        prepared.executionClanker,
      );

    const baseBootstrap = buildBootstrapPayload({
      workerType: prepared.workerType,
      jobKind: session.mode,
      tenantId: "api-server",
      jobId,
      clankerId: session.clankerId,
      agent: prepared.executionClanker.agent,
      repository: prepared.sourceRepository,
      task,
      baseBranch: prepared.baseBranch,
      context: { ticketId: session.ticketId },
      settings: {},
      instructionFiles: prepared.workerInstructionFiles,
      requiredCredentials,
      callbackToken: submitResult.callbackToken,
      executionClanker: prepared.executionClanker,
      project: prepared.project,
    });

    const acpSessionId = extractAcpSessionId(session.metadataJson);

    const fullBootstrap = {
      ...baseBootstrap,
      agentSessionId: session.id,
      agentTurnId: assistantTurn.id,
      sessionMode: session.mode,
      acpSessionId,
      ...extras,
    };
    jobData.bootstrapPayload = fullBootstrap;
    await this.jobService.saveBootstrapPayload(jobId, fullBootstrap);

    await this.agentTurnDAO.update(assistantTurn.id, { jobId });

    this.workerExecutionService
      .executeJob(jobData, prepared.executionClanker, prepared.project)
      .then((result) => {
        logger.info("Agent session continuation worker invoked", {
          sessionId: session.id,
          jobId,
          executionId: result.executionId,
        });
      })
      .catch((err: unknown) => {
        logger.error("Agent session continuation worker invocation failed", {
          sessionId: session.id,
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return { id: jobId, status: "pending" };
  }
}

function buildContinuationJobData(
  jobId: string,
  session: AgentSession,
  task: string,
): JobData {
  const base = {
    id: jobId,
    tenantId: "api-server" as const,
    repository: session.repository ?? "",
    task,
    baseBranch: session.baseBranch ?? undefined,
    settings: {},
    timestamp: Date.now(),
  };

  if (session.mode === "research") {
    const data: ResearchJobData = {
      ...base,
      jobKind: "research",
      context: { ticketId: session.ticketId },
    };
    return data;
  }
  if (session.mode === "planning") {
    const data: PlanningJobData = {
      ...base,
      jobKind: "planning",
      context: { ticketId: session.ticketId },
    };
    return data;
  }
  const data: TicketJobData = {
    ...base,
    jobKind: "execution",
    context: { ticketId: session.ticketId },
  };
  return data;
}

function extractAcpSessionId(metadata: JsonValue | null): string | null {
  if (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
  ) {
    const val = metadata.acpSessionId;
    return typeof val === "string" ? val : null;
  }
  return null;
}
