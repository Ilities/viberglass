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
import type { CredentialRequirementsService } from "../CredentialRequirementsService";
import type { JobService } from "../JobService";
import type { WorkerExecutionService } from "../../workers";
import { TicketDAO } from "../../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations";
import { SecretService } from "../SecretService";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { getClankerProvisioner } from "../../provisioning/provisioningFactory";
import { InstructionStorageService } from "../instructions/InstructionStorageService";
import { TicketPhaseDocumentService } from "../TicketPhaseDocumentService";
import {
  TicketPhaseDocumentCommentDAO,
  type PhaseDocumentComment,
  PHASE_DOCUMENT_COMMENT_STATUS,
} from "../../persistence/ticketing/TicketPhaseDocumentCommentDAO";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import {
  AGENT_SESSION_EVENT_TYPE,
  AGENT_SESSION_STATUS,
  AGENT_TURN_ROLE,
  AGENT_TURN_STATUS,
} from "../../types/agentSession";
import {
  buildBootstrapPayload,
  type PreparedTicketRunContext,
  prepareTicketRunContext,
} from "../ticketRunOrchestration";
import type {
  JobData,
  PlanningJobData,
  ResearchJobData,
  TicketJobData,
} from "../../types/Job";
import type { JsonValue } from "../../persistence/types/database";
import { PromptTemplateService } from "../PromptTemplateService";
import {
  PromptTemplateDAO,
  PROMPT_TYPE,
} from "../../persistence/promptTemplate/PromptTemplateDAO";

interface ContinuationExtras {
  task: string;
  [key: string]: unknown;
}

export interface ReplyResult {
  currentTurn: AgentTurn;
  job: { id: string | null; status: string };
}

export interface LaunchPendingOptions {
  /** Clear session.latestPendingRequestId (reply/approve flows) */
  clearPendingRequest?: boolean;
}

const SUGGESTION_PREFIX = "@@SUGGESTION@@\n";

/**
 * Owns continuation-turn launching for agent sessions. Every continuation
 * batches ALL currently-unconsumed user turns into a single assistant
 * turn — this is the core of the multiplayer queue model: users can send
 * messages anytime; each worker job carries everything said since the
 * previous turn.
 *
 * All public methods expect the caller to hold the per-session mutex
 * (AgentSessionMutex) — they deliberately do not lock themselves because
 * they are invoked from within already-locked flows.
 */
export class SessionTurnContinuationService {
  private readonly ticketDAO = new TicketDAO();
  private readonly projectDAO = new ProjectDAO();
  private readonly projectScmConfigDAO = new ProjectScmConfigDAO();
  private readonly integrationCredentialDAO = new IntegrationCredentialDAO();
  private readonly secretService = new SecretService();
  private readonly clankerDAO = new ClankerDAO();
  private readonly provisioningService = getClankerProvisioner();
  private readonly instructionStorageService = new InstructionStorageService();
  private readonly documentService = new TicketPhaseDocumentService();
  private readonly commentDAO = new TicketPhaseDocumentCommentDAO();
  private readonly promptTemplateService = new PromptTemplateService(
    new PromptTemplateDAO(),
  );

  constructor(
    private readonly agentSessionDAO: AgentSessionDAO,
    private readonly agentTurnDAO: AgentTurnDAO,
    private readonly agentSessionEventDAO: AgentSessionEventDAO,
    private readonly jobService: JobService,
    private readonly credentialRequirementsService: CredentialRequirementsService,
    private readonly workerExecutionService: WorkerExecutionService,
  ) {}

  /**
   * Batch every unconsumed user turn of the session into one continuation
   * turn and launch its worker job. Returns null when there is nothing
   * pending to launch.
   */
  async launchForPendingMessages(
    session: AgentSession,
    options: LaunchPendingOptions = {},
  ): Promise<ReplyResult | null> {
    const pendingUserTurns = await this.agentTurnDAO.listUnconsumedUserTurns(
      session.id,
    );
    if (pendingUserTurns.length === 0) return null;

    const batchedTask = pendingUserTurns
      .map((turn) => turn.contentMarkdown ?? "")
      .filter((content) => content.length > 0)
      .join("\n\n");

    const lastPending = pendingUserTurns[pendingUserTurns.length - 1];
    const maxSeq = await this.agentSessionEventDAO.getMaxSequence(session.id);

    const assistantTurn = await this.agentTurnDAO.create({
      sessionId: session.id,
      role: AGENT_TURN_ROLE.ASSISTANT,
      sequence: lastPending.sequence + 1,
      status: AGENT_TURN_STATUS.QUEUED,
    });
    await this.agentSessionEventDAO.create({
      sessionId: session.id,
      turnId: assistantTurn.id,
      sequence: maxSeq + 1,
      eventType: AGENT_SESSION_EVENT_TYPE.TURN_STARTED,
      payloadJson: { turnId: assistantTurn.id },
    });

    await this.agentTurnDAO.markConsumed(
      pendingUserTurns.map((turn) => turn.id),
      assistantTurn.id,
    );

    const job = await this.launchContinuationJob(session, assistantTurn, {
      task: batchedTask,
    });

    await this.agentSessionDAO.update(session.id, {
      status: AGENT_SESSION_STATUS.ACTIVE,
      lastJobId: job.id,
      lastTurnId: assistantTurn.id,
      ...(options.clearPendingRequest ? { latestPendingRequestId: null } : {}),
    });

    return { currentTurn: assistantTurn, job };
  }

  /**
   * Launch a continuation for messages queued while a turn was running.
   * No-op unless the session is ACTIVE with unconsumed user turns —
   * e.g. skipped when the agent is waiting on input/approval or the
   * session reached a terminal state.
   */
  async drainQueuedMessages(sessionId: string): Promise<void> {
    const session = await this.agentSessionDAO.getById(sessionId);
    if (!session || session.status !== AGENT_SESSION_STATUS.ACTIVE) return;
    await this.launchForPendingMessages(session);
  }

  private async launchContinuationJob(
    session: AgentSession,
    assistantTurn: AgentTurn,
    extras: ContinuationExtras,
  ): Promise<{ id: string; status: string }> {
    const rawTask = extras.task;
    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const prepared = await prepareTicketRunContext(
      { projectId: session.projectId, clankerId: session.clankerId, jobId },
      {
        projectDAO: this.projectDAO,
        projectScmConfigDAO: this.projectScmConfigDAO,
        integrationCredentialDAO: this.integrationCredentialDAO,
        secretService: this.secretService,
        clankerDAO: this.clankerDAO,
        provisioningService: this.provisioningService,
        instructionStorageService: this.instructionStorageService,
      },
    );

    const ticket = await this.ticketDAO.getTicket(session.ticketId);

    let researchDocumentContent: string | undefined;
    let planDocumentContent: string | undefined;
    let openComments: PhaseDocumentComment[] = [];

    if (session.mode === "research") {
      const researchDoc = await this.documentService.getOrCreateDocument(
        session.ticketId,
        TICKET_WORKFLOW_PHASE.RESEARCH,
      );
      if (researchDoc.content?.trim()) {
        researchDocumentContent = researchDoc.content;
      }
      const allComments = await this.commentDAO.listByTicketAndPhase(
        session.ticketId,
        "research",
      );
      openComments = allComments.filter(
        (c) => c.status === PHASE_DOCUMENT_COMMENT_STATUS.OPEN,
      );
    }

    if (session.mode === "planning") {
      const researchDoc = await this.documentService.getOrCreateDocument(
        session.ticketId,
        TICKET_WORKFLOW_PHASE.RESEARCH,
      );
      researchDocumentContent = researchDoc.content;

      const planDoc = await this.documentService.getOrCreateDocument(
        session.ticketId,
        TICKET_WORKFLOW_PHASE.PLANNING,
      );
      if (planDoc.content?.trim()) {
        planDocumentContent = planDoc.content;
      }
      const allComments = await this.commentDAO.listByTicketAndPhase(
        session.ticketId,
        "planning",
      );
      openComments = allComments.filter(
        (c) => c.status === PHASE_DOCUMENT_COMMENT_STATUS.OPEN,
      );
    }

    const openCommentsStr =
      openComments.length > 0
        ? openComments
            .map((c) => {
              const actor = c.actor ? ` (by ${c.actor})` : "";
              if (c.content.startsWith(SUGGESTION_PREFIX)) {
                const suggestion = c.content.slice(SUGGESTION_PREFIX.length);
                return `- Line ${c.lineNumber}${actor}: **Suggestion:** ${suggestion}`;
              }
              return `- Line ${c.lineNumber}${actor}: ${c.content}`;
            })
            .join("\n")
        : undefined;

    const revisionType =
      session.mode === "research"
        ? PROMPT_TYPE.ticket_research_revision_task
        : PROMPT_TYPE.ticket_planning_revision_task;

    const enrichedTask = await this.promptTemplateService.render(
      revisionType,
      session.projectId,
      {
        initialMessage: rawTask,
        researchDocument: researchDocumentContent,
        planDocument: planDocumentContent,
        openComments: openCommentsStr,
      },
    );

    const jobData = buildContinuationJobData(
      jobId,
      session,
      enrichedTask,
      prepared,
      ticket,
      researchDocumentContent,
      planDocumentContent,
    );
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
      task: enrichedTask,
      baseBranch: prepared.baseBranch,
      context: jobData.context,
      settings: {},
      instructionFiles: prepared.workerInstructionFiles,
      requiredCredentials,
      callbackToken: submitResult.callbackToken,
      executionClanker: prepared.executionClanker,
      project: prepared.project,
    });

    const acpSessionId = extractAcpSessionId(session.metadataJson);
    const conversationStateUrl = extractConversationStateUrl(
      session.metadataJson,
    );

    const fullBootstrap = {
      ...baseBootstrap,
      agentSessionId: session.id,
      agentTurnId: assistantTurn.id,
      sessionMode: session.mode,
      acpSessionId,
      conversationStateUrl,
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
  prepared: PreparedTicketRunContext,
  ticket: {
    id: string;
    title: string;
    description: string;
    externalTicketId?: string | null;
    projectId: string;
  } | null,
  researchDocumentContent?: string,
  planDocumentContent?: string,
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
      context: {
        ticketId: session.ticketId,
        researchDocument: researchDocumentContent,
        instructionFiles: prepared.mergedInstructionFiles,
      },
    };
    return data;
  }
  if (session.mode === "planning") {
    const data: PlanningJobData = {
      ...base,
      jobKind: "planning",
      context: {
        ticketId: session.ticketId,
        researchDocument: researchDocumentContent ?? "",
        planDocument: planDocumentContent,
        instructionFiles: prepared.mergedInstructionFiles,
      },
    };
    return data;
  }
  const data: TicketJobData = {
    ...base,
    jobKind: "execution",
    context: {
      ticketId: session.ticketId,
      instructionFiles: prepared.mergedInstructionFiles,
    },
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

function extractConversationStateUrl(
  metadata: JsonValue | null,
): string | null {
  if (
    metadata !== null &&
    typeof metadata === "object" &&
    !Array.isArray(metadata)
  ) {
    const val = metadata.conversationStateUrl;
    return typeof val === "string" ? val : null;
  }
  return null;
}
