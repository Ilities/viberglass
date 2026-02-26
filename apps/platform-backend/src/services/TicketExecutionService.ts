import { randomUUID } from "crypto";
import logger from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { getClankerProvisioner } from "../provisioning/provisioningFactory";
import { JobService } from "./JobService";
import { CredentialRequirementsService } from "./CredentialRequirementsService";
import { WorkerExecutionService } from "../workers";
import { JobData } from "../types/Job";
import type { Clanker, Project } from "@viberglass/types";
import { TicketMediaExecutionService } from "./TicketMediaExecutionService";
import { getStrategyType } from "../clanker-config";
import { InstructionStorageService } from "./instructions/InstructionStorageService";
import {
  isAllowedInstructionPath,
  normalizeInstructionPath,
} from "./instructions/pathPolicy";

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
  private integrationCredentialDAO = new IntegrationCredentialDAO();
  private clankerDAO = new ClankerDAO();
  private provisioningService = getClankerProvisioner();
  private jobService = new JobService();
  private credentialRequirementsService = new CredentialRequirementsService();
  private workerExecutionService = new WorkerExecutionService();
  private ticketMediaExecutionService = new TicketMediaExecutionService();
  private instructionStorageService = new InstructionStorageService();

  private normalizeInstructionFile(
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

  private async resolveScmCredentialSecretId(
    scmConfig: {
      integrationCredentialId?: string | null;
      credentialSecretId?: string | null;
    } | null,
  ): Promise<string | null> {
    const legacyCredentialSecretId =
      typeof scmConfig?.credentialSecretId === "string" &&
      scmConfig.credentialSecretId.trim().length > 0
        ? scmConfig.credentialSecretId.trim()
        : null;
    if (legacyCredentialSecretId) {
      return legacyCredentialSecretId;
    }

    const integrationCredentialId = scmConfig?.integrationCredentialId?.trim();
    if (!integrationCredentialId) {
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
      const scmConfig = await this.projectScmConfigDAO.getByProjectId(
        project.id,
      );
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

      const scmCredentialSecretId = await this.resolveScmCredentialSecretId(
        scmConfig as {
          integrationCredentialId?: string | null;
          credentialSecretId?: string | null;
        } | null,
      );
      const mergedSecretIds = Array.from(
        new Set([
          ...(clanker.secretIds || []),
          ...(scmCredentialSecretId ? [scmCredentialSecretId] : []),
        ]),
      );
      const normalizedScmConfigWithCredential =
        normalizedScmConfig && scmCredentialSecretId
          ? {
              ...normalizedScmConfig,
              credentialSecretId: scmCredentialSecretId,
            }
          : normalizedScmConfig;
      const executionClanker = {
        ...clanker,
        secretIds: mergedSecretIds,
      };
      const workerType = getStrategyType(executionClanker);

      const mergedInstructionFiles = this.mergeInstructionFiles(
        project,
        executionClanker,
        instructionFiles || [],
      );
      // Generate jobId
      const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
      const workerInstructionFiles =
        workerType === "docker"
          ? mergedInstructionFiles
          : await this.instructionStorageService.uploadJobInstructionFiles(
              executionClanker.id,
              jobId,
              mergedInstructionFiles,
            );
      const ticketMediaExecution =
        await this.ticketMediaExecutionService.prepareForExecution(
          ticket,
          executionClanker,
        );

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
          originalTicketId: ticket.externalTicketId || ticket.id,
          stepsToReproduce: ticket.description,
          instructionFiles: mergedInstructionFiles,
          ...(ticketMediaExecution.media.length > 0
            ? { ticketMedia: ticketMediaExecution.media }
            : {}),
        },
        settings: {
          testRequired: false,
          maxChanges: 10,
        },
        scm: normalizedScmConfigWithCredential,
        overrides,
        ...(ticketMediaExecution.mounts.length > 0
          ? { mounts: ticketMediaExecution.mounts }
          : {}),
        timestamp: Date.now(),
      };

      const submitResult = await this.jobService.submitJob(jobData, {
        ticketId: ticket.id,
        clankerId: clanker.id,
      });

      // Attach callback token for worker authentication
      jobData.callbackToken = submitResult.callbackToken;

      const requiredCredentials =
        await this.credentialRequirementsService.getRequiredCredentialsForClanker(
          executionClanker,
        );

      const bootstrapPayload: Record<string, unknown> = {
        workerType,
        tenantId: jobData.tenantId,
        jobId: jobData.id,
        clankerId: clanker.id,
        agent: clanker.agent,
        repository: jobData.repository,
        task: jobData.task,
        branch: jobData.branch,
        baseBranch: jobData.baseBranch,
        context: jobData.context,
        settings: jobData.settings,
        instructionFiles: workerInstructionFiles,
        requiredCredentials,
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
        scm: normalizedScmConfigWithCredential,
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
