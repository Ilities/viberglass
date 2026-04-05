import { randomUUID } from "crypto";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import {
  TicketPhaseDocumentCommentDAO,
  PHASE_DOCUMENT_COMMENT_STATUS,
} from "../persistence/ticketing/TicketPhaseDocumentCommentDAO";
import { getClankerProvisioner } from "../provisioning/provisioningFactory";
import { CredentialRequirementsService } from "./CredentialRequirementsService";
import { JobService } from "./JobService";
import {
  type PhaseDocumentView,
  TicketPhaseDocumentService,
} from "./TicketPhaseDocumentService";
import { InstructionStorageService } from "./instructions/InstructionStorageService";
import { WorkerExecutionService } from "../workers";
import type { ResearchJobData } from "../types/Job";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "./errors/TicketServiceError";
import {
  type InlineInstructionFile,
  prepareTicketRunContext,
  submitJobWithBootstrapAndInvoke,
} from "./ticketRunOrchestration";
import { PromptTemplateService } from "./PromptTemplateService";
import {
  PromptTemplateDAO,
  PROMPT_TYPE,
} from "../persistence/promptTemplate/PromptTemplateDAO";

export interface RunResearchOptions {
  clankerId: string;
  instructionFiles?: InlineInstructionFile[];
}

export interface ResearchRunView {
  id: string;
  jobId: string;
  status: "queued" | "active" | "completed" | "failed";
  clankerId: string;
  clankerName: string | null;
  clankerSlug: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface ResearchPhaseView {
  document: PhaseDocumentView;
  latestRun: ResearchRunView | null;
}

export class TicketResearchService {
  private readonly ticketDAO = new TicketDAO();
  private readonly projectDAO = new ProjectDAO();
  private readonly projectScmConfigDAO = new ProjectScmConfigDAO();
  private readonly integrationCredentialDAO = new IntegrationCredentialDAO();
  private readonly clankerDAO = new ClankerDAO();
  private readonly provisioningService = getClankerProvisioner();
  private readonly jobService = new JobService();
  private readonly credentialRequirementsService =
    new CredentialRequirementsService();
  private readonly workerExecutionService = new WorkerExecutionService();
  private readonly documentService = new TicketPhaseDocumentService();
  private readonly phaseRunDAO = new TicketPhaseRunDAO();
  private readonly commentDAO = new TicketPhaseDocumentCommentDAO();
  private readonly instructionStorageService = new InstructionStorageService();
  private readonly promptTemplateService = new PromptTemplateService(
    new PromptTemplateDAO(),
  );

  async getResearchPhase(ticketId: string): Promise<ResearchPhaseView> {
    const document = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );
    const latestRun = await this.phaseRunDAO.getLatestRun(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );

    return {
      document,
      latestRun: latestRun
        ? {
            id: latestRun.id,
            jobId: latestRun.jobId,
            status: latestRun.status,
            clankerId: latestRun.clankerId,
            clankerName: latestRun.clankerName,
            clankerSlug: latestRun.clankerSlug,
            createdAt: latestRun.createdAt.toISOString(),
            startedAt: latestRun.startedAt?.toISOString() || null,
            finishedAt: latestRun.finishedAt?.toISOString() || null,
          }
        : null,
    };
  }

  async runResearch(
    ticketId: string,
    options: RunResearchOptions,
  ): Promise<{ jobId: string; status: string }> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    if (ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.RESEARCH) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.RESEARCH_RUN_INVALID_PHASE,
        "Research runs are only allowed during the research phase",
      );
    }

    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const preparedContext = await prepareTicketRunContext(
      {
        projectId: ticket.projectId,
        clankerId: options.clankerId,
        jobId,
        instructionFiles: options.instructionFiles || [],
      },
      {
        projectDAO: this.projectDAO,
        projectScmConfigDAO: this.projectScmConfigDAO,
        integrationCredentialDAO: this.integrationCredentialDAO,
        clankerDAO: this.clankerDAO,
        provisioningService: this.provisioningService,
        instructionStorageService: this.instructionStorageService,
      },
    );

    const {
      sourceRepository,
      baseBranch,
      executionClanker,
      mergedInstructionFiles,
    } = preparedContext;

    const task = await this.promptTemplateService.render(
      PROMPT_TYPE.ticket_research,
      ticket.projectId,
      {
        externalTicketId: ticket.externalTicketId ?? undefined,
        ticketTitle: ticket.title,
        ticketDescription: ticket.description,
      },
    );

    const jobData: ResearchJobData = {
      id: jobId,
      jobKind: "research",
      tenantId: "api-server",
      repository: sourceRepository,
      task,
      baseBranch,
      context: {
        ticketId: ticket.id,
        instructionFiles: mergedInstructionFiles,
      },
      settings: {
        testRequired: false,
        maxChanges: 1,
      },
      timestamp: Date.now(),
    };

    // Submit job, build bootstrap, and invoke worker (fire-and-forget)
    const result = await submitJobWithBootstrapAndInvoke(
      jobData,
      ticket.id,
      executionClanker.id,
      "Research",
      preparedContext,
      {
        jobService: this.jobService,
        credentialRequirementsService: this.credentialRequirementsService,
        workerExecutionService: this.workerExecutionService,
      },
    );

    // Record phase run
    await this.phaseRunDAO.createRun(
      ticket.id,
      jobData.id,
      executionClanker.id,
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );

    return result;
  }

  async runResearchRevision(
    ticketId: string,
    options: { clankerId: string; revisionMessage: string },
  ): Promise<{ jobId: string; status: string }> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }

    // Get existing research document
    const researchDoc = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );
    const researchDocumentContent = researchDoc.content?.trim() || undefined;

    // Gather open comments
    const allComments = await this.commentDAO.listByTicketAndPhase(
      ticketId,
      "research",
    );
    const openComments = allComments.filter(
      (c) => c.status === PHASE_DOCUMENT_COMMENT_STATUS.OPEN,
    );

    const SUGGESTION_PREFIX = "@@SUGGESTION@@\n";
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

    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const preparedContext = await prepareTicketRunContext(
      {
        projectId: ticket.projectId,
        clankerId: options.clankerId,
        jobId,
        instructionFiles: [],
      },
      {
        projectDAO: this.projectDAO,
        projectScmConfigDAO: this.projectScmConfigDAO,
        integrationCredentialDAO: this.integrationCredentialDAO,
        clankerDAO: this.clankerDAO,
        provisioningService: this.provisioningService,
        instructionStorageService: this.instructionStorageService,
      },
    );

    const {
      sourceRepository,
      baseBranch,
      executionClanker,
      mergedInstructionFiles,
    } = preparedContext;

    const planDoc = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );
    const planDocumentContent = planDoc.content?.trim() || undefined;

    // Use revision task type since we have an existing document
    const task = await this.promptTemplateService.render(
      PROMPT_TYPE.ticket_research_revision_task,
      ticket.projectId,
      {
        externalTicketId: ticket.externalTicketId ?? undefined,
        ticketTitle: ticket.title,
        ticketDescription: ticket.description,
        researchDocument: researchDocumentContent,
        planDocument: planDocumentContent,
        revisionMessage: options.revisionMessage,
        openComments: openCommentsStr,
      },
    );

    const jobData: ResearchJobData = {
      id: jobId,
      jobKind: "research",
      tenantId: "api-server",
      repository: sourceRepository,
      task,
      baseBranch,
      context: {
        ticketId: ticket.id,
        researchDocument: researchDocumentContent,
        planDocument: planDocumentContent,
        instructionFiles: mergedInstructionFiles,
      },
      settings: {
        testRequired: false,
        maxChanges: 1,
      },
      timestamp: Date.now(),
    };

    const result = await submitJobWithBootstrapAndInvoke(
      jobData,
      ticket.id,
      executionClanker.id,
      "Research Revision",
      preparedContext,
      {
        jobService: this.jobService,
        credentialRequirementsService: this.credentialRequirementsService,
        workerExecutionService: this.workerExecutionService,
      },
    );

    await this.phaseRunDAO.createRun(
      ticket.id,
      jobData.id,
      executionClanker.id,
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );

    return result;
  }
}
