import { randomUUID } from "crypto";
import {
  JOB_KIND,
  TICKET_WORKFLOW_PHASE,
} from "@viberglass/types";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
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
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";
import {
  type InlineInstructionFile,
  prepareTicketRunContext,
  submitJobWithBootstrapAndInvoke,
} from "./ticketRunOrchestration";

export interface RunPlanningOptions {
  clankerId: string;
  instructionFiles?: InlineInstructionFile[];
}

export interface PlanningRunView {
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

export interface PlanningPhaseView {
  document: PhaseDocumentView;
  latestRun: PlanningRunView | null;
}

function buildPlanningTask(input: {
  ticketTitle: string;
  ticketDescription: string;
  projectName: string;
  repository: string;
  baseBranch: string;
  researchDocument: string;
  externalTicketId?: string;
}): string {
  const externalTicketLine = input.externalTicketId
    ? `External Ticket ID: ${input.externalTicketId}\n`
    : "";

  return `Create a planning document for this ticket based on the research findings.

Ticket Title: ${input.ticketTitle}
${externalTicketLine}Project: ${input.projectName}
Repository: ${input.repository}
Base Branch: ${input.baseBranch}

Ticket Description:
${input.ticketDescription}

Research Document:
${input.researchDocument}

Requirements:
- Read and follow repository instructions from AGENTS.md and any provided instruction files.
- Analyze the research document to understand the problem.
- Create a detailed implementation plan.
- Do not create a branch, commit changes, push changes, or open a pull request.
- Do not modify application code unless it is strictly necessary to produce PLAN.md.
- Write your output to PLAN.md in the repository root.

PLAN.md should include:
- Summary of the Problem
- Proposed Solution
- Implementation Steps
- Files to Modify
- Testing Strategy
- Risks and Mitigations`;
}

export class TicketPlanningService {
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

  async getPlanningPhase(ticketId: string): Promise<PlanningPhaseView> {
    const document = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );
    const latestRun = await this.phaseRunDAO.getLatestRun(
      ticketId,
      TICKET_WORKFLOW_PHASE.PLANNING,
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

  async runPlanning(
    ticketId: string,
    options: RunPlanningOptions,
  ): Promise<{ jobId: string; status: string }> {
    const ticket = await this.ticketDAO.getTicket(ticketId);
    if (!ticket) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
        "Ticket not found",
      );
    }
    if (
      ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.PLANNING &&
      ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.EXECUTION
    ) {
      throw new TicketServiceError(
        TICKET_SERVICE_ERROR_CODE.PLANNING_RUN_INVALID_PHASE,
        "Planning runs are only allowed during the planning or execution phase",
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

    const researchDocument = await this.documentService.getOrCreateDocument(
      ticketId,
      TICKET_WORKFLOW_PHASE.RESEARCH,
    );

    const task = buildPlanningTask({
      ticketTitle: ticket.title,
      ticketDescription: ticket.description,
      projectName: project.name,
      repository: sourceRepository,
      baseBranch,
      researchDocument: researchDocument.content,
      externalTicketId: ticket.externalTicketId,
    });

    const jobData: JobData = {
      id: jobId,
      jobKind: JOB_KIND.PLANNING,
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
      "Planning",
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
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    return result;
  }

}
