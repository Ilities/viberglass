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
  AGENT_TURN_ROLE,
  AGENT_TURN_STATUS,
  type AgentSessionMode,
} from "../../types/agentSession";
import {
  buildBootstrapPayload,
  type PreparedTicketRunContext,
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
import { PromptTemplateService } from "../PromptTemplateService";
import {
  PromptTemplateDAO,
  PROMPT_TYPE,
} from "../../persistence/promptTemplate/PromptTemplateDAO";

export interface LaunchAgentSessionInput {
  ticketId: string;
  clankerId: string;
  mode: AgentSessionMode;
  initialMessage: string;
  instructionFileIds?: string[];
}

export interface LaunchAgentSessionResult {
  session: AgentSession;
  currentTurn: AgentTurn;
  job: { id: string; status: string };
}

const SUGGESTION_PREFIX = "@@SUGGESTION@@\n";

export class AgentSessionLaunchService {
  private readonly ticketDAO = new TicketDAO();
  private readonly projectDAO = new ProjectDAO();
  private readonly projectScmConfigDAO = new ProjectScmConfigDAO();
  private readonly integrationCredentialDAO = new IntegrationCredentialDAO();
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

  async launch(
    input: LaunchAgentSessionInput,
    userId?: string,
  ): Promise<LaunchAgentSessionResult> {
    const ticket = await this.ticketDAO.getTicket(input.ticketId);
    if (!ticket) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }

    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const prepared = await prepareTicketRunContext(
      { projectId: ticket.projectId, clankerId: input.clankerId, jobId },
      {
        projectDAO: this.projectDAO,
        projectScmConfigDAO: this.projectScmConfigDAO,
        integrationCredentialDAO: this.integrationCredentialDAO,
        clankerDAO: this.clankerDAO,
        provisioningService: this.provisioningService,
        instructionStorageService: this.instructionStorageService,
      },
    );

    const existing = await this.agentSessionDAO.getActiveByTicketAndMode(
      input.ticketId,
      input.mode,
    );
    if (existing) {
      throw new AgentSessionServiceError(
        AGENT_SESSION_SERVICE_ERROR_CODE.SESSION_ALREADY_ACTIVE,
        "An active session already exists for this ticket and mode",
      );
    }

    let researchDocumentContent: string | undefined;
    let planDocumentContent: string | undefined;
    let openComments: PhaseDocumentComment[] = [];

    if (input.mode === "research") {
      const researchDoc = await this.documentService.getOrCreateDocument(
        input.ticketId,
        TICKET_WORKFLOW_PHASE.RESEARCH,
      );
      if (researchDoc.content?.trim()) {
        researchDocumentContent = researchDoc.content;
      }
      const allComments = await this.commentDAO.listByTicketAndPhase(
        input.ticketId,
        "research",
      );
      openComments = allComments.filter(
        (c) => c.status === PHASE_DOCUMENT_COMMENT_STATUS.OPEN,
      );
    }

    if (input.mode === "planning") {
      const researchDoc = await this.documentService.getOrCreateDocument(
        input.ticketId,
        TICKET_WORKFLOW_PHASE.RESEARCH,
      );
      researchDocumentContent = researchDoc.content;

      const planDoc = await this.documentService.getOrCreateDocument(
        input.ticketId,
        TICKET_WORKFLOW_PHASE.PLANNING,
      );
      if (planDoc.content?.trim()) {
        planDocumentContent = planDoc.content;
      }
      const allComments = await this.commentDAO.listByTicketAndPhase(
        input.ticketId,
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
      input.mode === "research"
        ? PROMPT_TYPE.ticket_research_revision
        : PROMPT_TYPE.ticket_planning_revision;

    const enrichedMessage = await this.promptTemplateService.render(
      revisionType,
      ticket.projectId,
      {
        initialMessage: input.initialMessage,
        researchDocument: researchDocumentContent,
        planDocument: planDocumentContent,
        openComments: openCommentsStr,
      },
    );

    const session = await this.agentSessionDAO.create({
      tenantId: "api-server",
      projectId: ticket.projectId,
      ticketId: input.ticketId,
      clankerId: input.clankerId,
      mode: input.mode,
      repository: prepared.sourceRepository,
      baseBranch: prepared.baseBranch,
      createdBy: userId ?? null,
    });

    const assistantTurn = await this.createInitialTurns(
      session.id,
      enrichedMessage,
    );

    const jobData = await this.buildJobData(jobId, input, prepared, ticket, researchDocumentContent, planDocumentContent);
    const submitResult = await this.jobService.submitJob(jobData, {
      ticketId: input.ticketId,
      clankerId: input.clankerId,
    });
    jobData.callbackToken = submitResult.callbackToken;

    const requiredCredentials =
      await this.credentialRequirementsService.getRequiredCredentialsForClanker(
        prepared.executionClanker,
      );
    const baseBootstrap = buildBootstrapPayload({
      workerType: prepared.workerType,
      jobKind: input.mode,
      tenantId: "api-server",
      jobId,
      clankerId: input.clankerId,
      agent: prepared.executionClanker.agent,
      repository: prepared.sourceRepository,
      task: jobData.task,
      baseBranch: prepared.baseBranch,
      context: jobData.context,
      settings: {},
      instructionFiles: prepared.workerInstructionFiles,
      requiredCredentials,
      callbackToken: submitResult.callbackToken,
      executionClanker: prepared.executionClanker,
      project: prepared.project,
    });

    const fullBootstrap = {
      ...baseBootstrap,
      agentSessionId: session.id,
      agentTurnId: assistantTurn.id,
      sessionMode: input.mode,
    };
    jobData.bootstrapPayload = fullBootstrap;
    await this.jobService.saveBootstrapPayload(jobId, fullBootstrap);

    await this.agentSessionDAO.update(session.id, {
      lastJobId: jobId,
      lastTurnId: assistantTurn.id,
    });
    await this.agentTurnDAO.update(assistantTurn.id, { jobId });

    this.workerExecutionService
      .executeJob(jobData, prepared.executionClanker, prepared.project)
      .then((result) => {
        logger.info("Agent session worker invoked", {
          sessionId: session.id,
          jobId,
          executionId: result.executionId,
        });
      })
      .catch((err: unknown) => {
        logger.error("Agent session worker invocation failed", {
          sessionId: session.id,
          jobId,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return {
      session,
      currentTurn: assistantTurn,
      job: { id: jobId, status: "pending" },
    };
  }

  private async buildJobData(
    jobId: string,
    input: LaunchAgentSessionInput,
    prepared: PreparedTicketRunContext,
    ticket: { id: string; title: string; description: string; externalTicketId?: string | null; projectId: string },
    researchDocumentContent?: string,
    planDocumentContent?: string,
  ): Promise<JobData> {
    const ticketVars = {
      externalTicketId: ticket.externalTicketId ?? undefined,
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
    };

    let taskType: typeof PROMPT_TYPE[keyof typeof PROMPT_TYPE];
    if (input.mode === "research") {
      taskType = PROMPT_TYPE.ticket_research;
    } else if (input.mode === "planning") {
      taskType = researchDocumentContent?.trim()
        ? PROMPT_TYPE.ticket_planning_with_research
        : PROMPT_TYPE.ticket_planning_without_research;
    } else {
      taskType = PROMPT_TYPE.ticket_developing;
    }

    const task = await this.promptTemplateService.render(
      taskType,
      ticket.projectId,
      {
        ...ticketVars,
        researchDocument: researchDocumentContent?.trim() || undefined,
      },
    );

    const base = {
      id: jobId,
      tenantId: "api-server" as const,
      repository: prepared.sourceRepository,
      task,
      baseBranch: prepared.baseBranch,
      settings: {},
      timestamp: Date.now(),
    };

    if (input.mode === "research") {
      const data: ResearchJobData = {
        ...base,
        jobKind: "research",
        context: {
          ticketId: input.ticketId,
          researchDocument: researchDocumentContent,
          instructionFiles: prepared.mergedInstructionFiles,
        },
      };
      return data;
    }
    if (input.mode === "planning") {
      const data: PlanningJobData = {
        ...base,
        jobKind: "planning",
        context: {
          ticketId: input.ticketId,
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
        ticketId: input.ticketId,
        instructionFiles: prepared.mergedInstructionFiles,
      },
    };
    return data;
  }

  private async createInitialTurns(
    sessionId: string,
    initialMessage: string,
  ): Promise<AgentTurn> {
    let seq = 1;

    await this.agentSessionEventDAO.create({
      sessionId,
      sequence: seq++,
      eventType: AGENT_SESSION_EVENT_TYPE.SESSION_STARTED,
      payloadJson: {},
    });

    const userTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.USER,
      sequence: 1,
      status: AGENT_TURN_STATUS.COMPLETED,
      contentMarkdown: initialMessage,
    });

    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: userTurn.id,
      sequence: seq++,
      eventType: AGENT_SESSION_EVENT_TYPE.USER_MESSAGE,
      payloadJson: { content: initialMessage },
    });

    const assistantTurn = await this.agentTurnDAO.create({
      sessionId,
      role: AGENT_TURN_ROLE.ASSISTANT,
      sequence: 2,
      status: AGENT_TURN_STATUS.QUEUED,
    });

    await this.agentSessionEventDAO.create({
      sessionId,
      turnId: assistantTurn.id,
      sequence: seq,
      eventType: AGENT_SESSION_EVENT_TYPE.TURN_STARTED,
      payloadJson: { turnId: assistantTurn.id },
    });

    return assistantTurn;
  }
}
