import { randomUUID } from "crypto";
import logger from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { ClankerProvisioningService } from "./ClankerProvisioningService";
import { JobService } from "./JobService";
import { SecretResolutionService } from "./SecretResolutionService";
import { WorkerExecutionService } from "../workers";
import { JobData } from "../types/Job";
import type { Clanker, Project } from "@viberglass/types";

export interface InlineInstructionFile {
  fileType: string;
  content: string;
}

export interface RunTicketOptions {
  clankerId: string;
  overrides?: JobData["overrides"];
  instructionFiles?: InlineInstructionFile[];
}

export interface RunTicketResult {
  jobId: string;
  status: string;
}

export class TicketExecutionService {
  private ticketDAO = new TicketDAO();
  private projectDAO = new ProjectDAO();
  private projectScmConfigDAO = new ProjectScmConfigDAO();
  private clankerDAO = new ClankerDAO();
  private provisioningService = new ClankerProvisioningService();
  private jobService = new JobService();
  private secretResolutionService = new SecretResolutionService();
  private workerExecutionService = new WorkerExecutionService();

  private normalizeInstructionFile(
    file: Partial<InlineInstructionFile> | null | undefined,
  ): InlineInstructionFile | null {
    if (!file?.fileType || typeof file.fileType !== "string") {
      return null;
    }

    const fileType = file.fileType.trim();
    const content = typeof file.content === "string" ? file.content : "";

    if (!fileType || !content.trim()) {
      return null;
    }

    return { fileType, content };
  }

  private mergeInstructionFiles(
    project: { agentInstructions?: string | null },
    clanker: {
      configFiles?: Array<{ fileType: string; content: string }>;
    },
    runtimeInstructionFiles: Array<Partial<InlineInstructionFile>> = [],
  ): InlineInstructionFile[] {
    const merged = new Map<string, InlineInstructionFile>();

    const addFiles = (files: Array<Partial<InlineInstructionFile>>) => {
      for (const file of files) {
        const normalized = this.normalizeInstructionFile(file);
        if (!normalized) continue;
        merged.set(normalized.fileType.toLowerCase(), normalized);
      }
    };

    const projectFiles: Array<InlineInstructionFile> = project.agentInstructions
      ? [{ fileType: "AGENTS.md", content: project.agentInstructions }]
      : [];

    const clankerFiles: Array<InlineInstructionFile> = (
      clanker.configFiles || []
    ).map((file) => ({
      fileType: file.fileType,
      content: file.content,
    }));

    addFiles(projectFiles);
    addFiles(clankerFiles);
    addFiles(runtimeInstructionFiles);

    return Array.from(merged.values());
  }

  async runTicket(
    ticketId: string,
    options: RunTicketOptions,
  ): Promise<RunTicketResult> {
    const { clankerId, overrides, instructionFiles } = options;
    let submittedJobId: string | undefined;

    try {
      // Get ticket by id
      const ticket = await this.ticketDAO.getTicket(ticketId);
      if (!ticket) {
        throw new Error("Ticket not found");
      }

      // Get project by ticket.projectId
      const project = await this.projectDAO.getProject(ticket.projectId);
      if (!project) {
        logger.error("Project not found for ticket", {
          ticketId,
          projectId: ticket.projectId,
        });
        throw new Error("Associated project not found");
      }

      const repositoryUrls =
        project.repositoryUrls && project.repositoryUrls.length > 0
          ? project.repositoryUrls
          : project.repositoryUrl
            ? [project.repositoryUrl]
            : [];
      const primaryRepository = repositoryUrls[0];
      const scmConfig = await this.projectScmConfigDAO.getByProjectId(project.id);
      const normalizedScmConfig = scmConfig
        ? {
            integrationId: scmConfig.integrationId,
            integrationSystem: scmConfig.integrationSystem,
            sourceRepository: scmConfig.sourceRepository.trim(),
            baseBranch: scmConfig.baseBranch.trim() || "main",
            pullRequestRepository:
              scmConfig.pullRequestRepository?.trim() ||
              scmConfig.sourceRepository.trim(),
            pullRequestBaseBranch:
              scmConfig.pullRequestBaseBranch?.trim() ||
              scmConfig.baseBranch.trim() ||
              "main",
            branchNameTemplate: scmConfig.branchNameTemplate?.trim() || null,
            credentialSecretId: scmConfig.credentialSecretId ?? null,
          }
        : null;
      const sourceRepository =
        normalizedScmConfig?.sourceRepository || primaryRepository;
      const baseBranch = normalizedScmConfig?.baseBranch || "main";

      // Validate project has repository configured
      if (!sourceRepository) {
        throw new Error("Project has no repository configured");
      }

      // Get clanker by clankerId
      const clanker = await this.clankerDAO.getClanker(clankerId);
      if (!clanker) {
        throw new Error("Clanker not found");
      }

      const availability =
        await this.provisioningService.resolveAvailabilityStatus(clanker);
      const currentStatus = availability.status;
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

      // Validate clanker has deploymentStrategyId and status is 'active'
      if (!clanker.deploymentStrategyId) {
        throw new Error(
          "Selected clanker has no deployment strategy configured",
        );
      }

      if (currentStatus !== "active") {
        throw new Error(
          `Selected clanker is ${currentStatus}. Only active clankers can run jobs.`,
        );
      }

      const mergedSecretIds = Array.from(
        new Set([
          ...(clanker.secretIds || []),
          ...(normalizedScmConfig?.credentialSecretId
            ? [normalizedScmConfig.credentialSecretId]
            : []),
        ]),
      );
      const executionClanker = {
        ...clanker,
        secretIds: mergedSecretIds,
      };

      const mergedInstructionFiles = this.mergeInstructionFiles(
        project,
        executionClanker,
        instructionFiles || [],
      );

      // Generate jobId
      const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;

      // Create job via JobService.submitJob with ticket and clanker references
      const jobData: JobData = {
        id: jobId,
        tenantId: "api-server", // Hardcoded for now, per RESEARCH.md
        repository: sourceRepository,
        task: `${ticket.title}\n\n${ticket.description}`,
        branch: undefined, // Worker creates branch
        baseBranch,
        context: {
          ticketId: ticket.id,
          stepsToReproduce: ticket.description,
          instructionFiles: mergedInstructionFiles,
        },
        settings: {
          testRequired: false,
          maxChanges: 10,
        },
        scm: normalizedScmConfig,
        overrides,
        timestamp: Date.now(),
      };

      const submitResult = await this.jobService.submitJob(jobData, {
        ticketId: ticket.id,
        clankerId: clanker.id,
      });
      submittedJobId = submitResult.jobId;

      // Attach callback token for worker authentication
      jobData.callbackToken = submitResult.callbackToken;

      const secretMetadata =
        await this.secretResolutionService.getSecretMetadataForClanker(
          mergedSecretIds,
        );
      const requiredCredentials = secretMetadata.map((secret) => secret.name);

      const bootstrapPayload: Record<string, unknown> = {
        workerType: "docker",
        tenantId: jobData.tenantId,
        jobId: jobData.id,
        clankerId: clanker.id,
        repository: jobData.repository,
        task: jobData.task,
        branch: jobData.branch,
        baseBranch: jobData.baseBranch,
        context: jobData.context,
        settings: jobData.settings,
        instructionFiles: mergedInstructionFiles,
        requiredCredentials,
        callbackToken: submitResult.callbackToken,
        clankerConfig: executionClanker,
        projectConfig: {
          id: project.id,
          name: project.name,
          autoFixTags: project.autoFixTags,
          customFieldMappings: project.customFieldMappings,
          workerSettings: project.workerSettings,
        },
        scm: normalizedScmConfig,
        overrides: jobData.overrides,
      };

      jobData.bootstrapPayload = bootstrapPayload;
      await this.jobService.saveBootstrapPayload(jobData.id, bootstrapPayload);

      // Invoke worker via WorkerExecutionService.executeJob - fire and forget
      // Don't await the result, just log errors
      this.workerExecutionService
        .executeJob(
          jobData,
          executionClanker as unknown as Clanker,
          project as unknown as Project,
        )
        .then((result) => {
          logger.info("Worker invoked successfully", {
            ticketId,
            jobId,
            clankerId,
            executionId: result.executionId,
          });
        })
        .catch((error) => {
          logger.error("Worker invocation failed", {
            ticketId,
            jobId,
            clankerId,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      return {
        jobId,
        status: "active",
      };
    } catch (error) {
      if (submittedJobId) {
        await this.jobService.updateJobStatus(submittedJobId, "failed", {
          errorMessage:
            error instanceof Error ? error.message : "Failed before invocation",
        });
      }
      throw error;
    }
  }
}
