import { randomUUID } from "crypto";
import {
  JOB_KIND,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";
import logger from "../config/logger";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketPhaseApprovalDAO } from "../persistence/ticketing/TicketPhaseApprovalDAO";
import { TicketPhaseRunDAO } from "../persistence/ticketing/TicketPhaseRunDAO";
import { getClankerProvisioner } from "../provisioning/provisioningFactory";
import { CredentialRequirementsService } from "./CredentialRequirementsService";
import { JobService } from "./JobService";
import {
  TicketPhaseDocumentService,
  type PhaseDocumentView,
} from "./TicketPhaseDocumentService";
import { InstructionStorageService } from "./instructions/InstructionStorageService";
import { WorkerExecutionService } from "../workers";
import type { JobData } from "../types/Job";
import { TicketWorkflowService } from "./TicketWorkflowService";
import type { FeedbackService } from "../webhooks/FeedbackService";
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";
import {
  type InlineInstructionFile,
  prepareTicketRunContext,
  submitJobWithBootstrapAndInvoke,
} from "./ticketRunOrchestration";

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

function buildResearchTask(input: {
  ticketTitle: string;
  ticketDescription: string;
  projectName: string;
  repository: string;
  baseBranch: string;
  externalTicketId?: string;
}): string {
  const externalTicketLine = input.externalTicketId
    ? `External Ticket ID: ${input.externalTicketId}\n`
    : "";

  return `Create a research document for this ticket.

Ticket Title: ${input.ticketTitle}
${externalTicketLine}Project: ${input.projectName}
Repository: ${input.repository}
Base Branch: ${input.baseBranch}

Ticket Description:
${input.ticketDescription}

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the repository and relevant code paths for this ticket.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce RESEARCH.md.
- Write your output to RESEARCH.md in the repository root.

RESEARCH.md should include:
- Summary
- Relevant Code Areas
- Root Cause Analysis
- Constraints and Risks
- Recommended Next Steps`;
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
  private readonly instructionStorageService = new InstructionStorageService();
  private readonly approvalDAO = new TicketPhaseApprovalDAO();
  private readonly workflowService = new TicketWorkflowService();
  private feedbackService?: FeedbackService;

  constructor(feedbackService?: FeedbackService) {
    this.feedbackService = feedbackService;
  }

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
      project,
      sourceRepository,
      baseBranch,
      executionClanker,
      mergedInstructionFiles,
    } = preparedContext;

    const task = buildResearchTask({
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      projectName: project.name,
      repository: sourceRepository,
      baseBranch,
      externalTicketId: ticket.externalTicketId,
    });

    const jobData: JobData = {
      id: jobId,
      jobKind: JOB_KIND.RESEARCH,
      tenantId: "api-server",
      repository: sourceRepository,
      task,
      baseBranch,
      context: {
        ticketId: ticket.id,
        originalTicketId: ticket.externalTicketId || ticket.id,
        stepsToReproduce: ticket.description,
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

  async requestApproval(
    ticketId: string,
    actor?: string,
  ): Promise<ResearchPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    if (ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.RESEARCH) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.RESEARCH_APPROVAL_INVALID_PHASE,
        "Research approval is only allowed during the research phase",
      );
    }

    const document = await this.documentService.requestApproval(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
      actor,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
      "approval_requested",
      actor,
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

  async approve(ticketId: string, actor?: string): Promise<ResearchPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    if (ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.RESEARCH) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.RESEARCH_APPROVAL_INVALID_PHASE,
        "Research approval is only allowed during the research phase",
      );
    }

    const document = await this.documentService.approveDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
      actor,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
      "approved",
      actor,
      "Research document approved",
    );

    // Auto-advance to planning phase
    await this.workflowService.advancePhase(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    // Post external comment asynchronously
    if (this.feedbackService) {
      this.feedbackService
        .postResearchApproved({
          id: ticketId,
          ticketId,
          workflowPhase: TICKET_WORKFLOW_PHASE.RESEARCH,
        })
        .catch((error) => {
          logger.error(
            `Failed to post research approval event for ticket ${ticketId}`,
            {
              error: error instanceof Error ? error.message : String(error),
              ticketId,
            },
          );
        });
    }

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

  async revokeApproval(
    ticketId: string,
    actor?: string,
  ): Promise<ResearchPhaseView> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }

    const document = await this.documentService.revokeApproval(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
      actor,
    );

    await this.approvalDAO.recordApprovalAction(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
      "revoked",
      actor,
      "Research approval revoked",
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
}
