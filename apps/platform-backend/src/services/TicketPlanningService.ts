import { randomUUID } from "crypto";
import {
  JOB_KIND,
  TICKET_WORKFLOW_PHASE,
  type Clanker,
  type Project,
} from "@viberglass/types";
import { getStrategyType } from "../clanker-config";
import logger from "../config/logger";
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
import {
  isAllowedInstructionPath,
  normalizeInstructionPath,
} from "./instructions/pathPolicy";
import { WorkerExecutionService } from "../workers";
import type { JobData } from "../types/Job";

interface InlineInstructionFile {
  fileType: string;
  content: string;
}

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

function normalizeInstructionFile(
  file: Partial<InlineInstructionFile> | null | undefined,
): InlineInstructionFile | null {
  if (!file?.fileType || typeof file.fileType !== "string") {
    return null;
  }

  const fileType = normalizeInstructionPath(file.fileType);
  const content = typeof file.content === "string" ? file.content : "";
  if (!fileType || !content.trim() || !isAllowedInstructionPath(fileType)) {
    return null;
  }

  return { fileType, content };
}

function mergeInstructionFiles(
  project: Pick<Project, "agentInstructions">,
  clanker: Pick<Clanker, "configFiles">,
  runtimeInstructionFiles: Array<Partial<InlineInstructionFile>> = [],
): InlineInstructionFile[] {
  const merged = new Map<string, InlineInstructionFile>();
  const addFiles = (files: Array<Partial<InlineInstructionFile>>) => {
    for (const file of files) {
      const normalized = normalizeInstructionFile(file);
      if (normalized) {
        merged.set(normalized.fileType.toLowerCase(), normalized);
      }
    }
  };

  addFiles(
    project.agentInstructions
      ? [{ fileType: "AGENTS.md", content: project.agentInstructions }]
      : [],
  );
  addFiles(
    (clanker.configFiles || []).map((file) => ({
      fileType: file.fileType,
      content: file.content,
    })),
  );
  addFiles(runtimeInstructionFiles);

  return Array.from(merged.values());
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
      throw new Error("Ticket not found");
    }
    if (
      ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.PLANNING &&
      ticket.workflowPhase !== TICKET_WORKFLOW_PHASE.EXECUTION
    ) {
      throw new Error(
        "Planning runs are only allowed during the planning or execution phase",
      );
    }

    const project = await this.projectDAO.getProject(ticket.projectId);
    if (!project) {
      throw new Error("Associated project not found");
    }

    const repositoryUrls =
      project.repositoryUrls && project.repositoryUrls.length > 0
        ? project.repositoryUrls
        : project.repositoryUrl
          ? [project.repositoryUrl]
          : [];
    const scmConfig = await this.projectScmConfigDAO.getByProjectId(project.id);
    const sourceRepository =
      scmConfig?.sourceRepository.trim() || repositoryUrls[0] || "";
    const baseBranch = scmConfig?.baseBranch.trim() || "main";
    if (!sourceRepository) {
      throw new Error("Project has no repository configured");
    }

    const clanker = await this.clankerDAO.getClanker(options.clankerId);
    if (!clanker) {
      throw new Error("Clanker not found");
    }

    const availability =
      await this.provisioningService.resolveAvailabilityStatus(clanker);
    const currentStatusMessage = availability.statusMessage ?? null;
    if (
      availability.status !== clanker.status ||
      (clanker.statusMessage ?? null) !== currentStatusMessage
    ) {
      await this.clankerDAO.updateStatus(
        clanker.id,
        availability.status,
        currentStatusMessage,
      );
    }
    if (!clanker.deploymentStrategyId) {
      throw new Error("Selected clanker has no deployment strategy configured");
    }
    if (availability.status !== "active") {
      throw new Error(
        `Selected clanker is ${availability.status}. Only active clankers can run jobs.`,
      );
    }

    const scmCredentialSecretId = await this.resolveScmCredentialSecretId(
      scmConfig?.integrationCredentialId || null,
    );
    const executionClanker: Clanker = {
      ...clanker,
      secretIds: Array.from(
        new Set([
          ...(clanker.secretIds || []),
          ...(scmCredentialSecretId ? [scmCredentialSecretId] : []),
        ]),
      ),
    };
    const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const workerType = getStrategyType(executionClanker);
    const mergedInstructionFiles = mergeInstructionFiles(
      project,
      executionClanker,
      options.instructionFiles || [],
    );
    const workerInstructionFiles =
      workerType === "docker"
        ? mergedInstructionFiles
        : await this.instructionStorageService.uploadJobInstructionFiles(
            executionClanker.id,
            jobId,
            mergedInstructionFiles,
          );

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

    const submitResult = await this.jobService.submitJob(jobData, {
      ticketId: ticket.id,
      clankerId: executionClanker.id,
    });

    jobData.callbackToken = submitResult.callbackToken;
    jobData.bootstrapPayload = {
      workerType,
      jobKind: jobData.jobKind,
      tenantId: jobData.tenantId,
      jobId: jobData.id,
      clankerId: executionClanker.id,
      agent: executionClanker.agent,
      repository: jobData.repository,
      task: jobData.task,
      branch: jobData.branch,
      baseBranch: jobData.baseBranch,
      context: jobData.context,
      settings: jobData.settings,
      instructionFiles: workerInstructionFiles,
      requiredCredentials:
        await this.credentialRequirementsService.getRequiredCredentialsForClanker(
          executionClanker,
        ),
      callbackToken: submitResult.callbackToken,
      ...(workerType === "docker"
        ? { clankerConfig: executionClanker }
        : { deploymentConfig: executionClanker.deploymentConfig }),
      projectConfig: {
        id: project.id,
        name: project.name,
        autoFixTags: project.autoFixTags,
        customFieldMappings: project.customFieldMappings,
        workerSettings: project.workerSettings,
      },
    };
    await this.jobService.saveBootstrapPayload(
      jobData.id,
      jobData.bootstrapPayload,
    );
    await this.phaseRunDAO.createRun(
      ticket.id,
      jobData.id,
      executionClanker.id,
      TICKET_WORKFLOW_PHASE.PLANNING,
    );

    this.workerExecutionService
      .executeJob(jobData, executionClanker, project)
      .then((result) => {
        logger.info("Planning worker invoked successfully", {
          ticketId,
          jobId,
          clankerId: executionClanker.id,
          executionId: result.executionId,
        });
      })
      .catch((error) => {
        logger.error("Planning worker invocation failed", {
          ticketId,
          jobId,
          clankerId: executionClanker.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });

    return {
      jobId,
      status: "active",
    };
  }

  private async resolveScmCredentialSecretId(
    integrationCredentialId: string | null,
  ): Promise<string | null> {
    if (!integrationCredentialId?.trim()) {
      return null;
    }

    const credential = await this.integrationCredentialDAO.getById(
      integrationCredentialId,
    );
    if (!credential) {
      throw new Error(
        `SCM integration credential not found: ${integrationCredentialId}`,
      );
    }

    return credential.secretId;
  }
}
