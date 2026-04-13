import { getStrategyType } from "../clanker-config";
import type { Clanker, ClankerStrategyType, Project, ProjectScmConfig } from "@viberglass/types";
import type { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import type { IntegrationCredentialDAO } from "../persistence/integrations";
import type { SecretService } from "./SecretService";
import type { ProjectDAO } from "../persistence/project/ProjectDAO";
import type { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import type { ClankerProvisioner } from "../provisioning/ClankerProvisioner";
import type { JobData, JobScmConfig } from "../types/Job";
import {
  type InlineInstructionFile as StoredInlineInstructionFile,
  type InstructionStorageService,
} from "./instructions/InstructionStorageService";
import {
  isAllowedInstructionPath,
  normalizeInstructionPath,
} from "./instructions/pathPolicy";
import {
  TicketServiceError,
  TICKET_SERVICE_ERROR_CODE,
} from "./errors/TicketServiceError";
import logger from "../config/logger";

type ProjectScmConfigWithLegacySecret = ProjectScmConfig & {
  credentialSecretId?: string | null;
};

export interface InlineInstructionFile {
  fileType: string;
  content: string;
}

export type WorkerInstructionFileReference =
  | InlineInstructionFile
  | { fileType: string; s3Url: string };

export interface TicketRunOrchestrationDependencies {
  projectDAO: Pick<ProjectDAO, "getProject">;
  projectScmConfigDAO: Pick<ProjectScmConfigDAO, "getByProjectId">;
  integrationCredentialDAO: Pick<IntegrationCredentialDAO, "getById">;
  secretService: Pick<SecretService, "getSecret">;
  clankerDAO: Pick<ClankerDAO, "getClanker" | "updateStatus">;
  provisioningService: Pick<ClankerProvisioner, "resolveAvailabilityStatus">;
  instructionStorageService: Pick<
    InstructionStorageService,
    "uploadJobInstructionFiles"
  >;
}

export interface PrepareTicketRunContextInput {
  projectId: string;
  clankerId: string;
  jobId: string;
  instructionFiles?: Array<Partial<InlineInstructionFile>>;
  additionalSecretIds?: string[];
}

export interface PreparedTicketRunContext {
  project: Project;
  scmConfig: ProjectScmConfigWithLegacySecret | null;
  sourceRepository: string;
  baseBranch: string;
  clanker: Clanker;
  executionClanker: Clanker;
  scmCredentialSecretId: string | null;
  scmCredentialSecretName: string | null;
  workerType: ClankerStrategyType;
  mergedInstructionFiles: InlineInstructionFile[];
  workerInstructionFiles: WorkerInstructionFileReference[];
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

export function mergeInstructionFiles(
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

async function resolveScmCredentialSecretId(
  integrationCredentialDAO: Pick<IntegrationCredentialDAO, "getById">,
  scmConfig: ProjectScmConfigWithLegacySecret | null,
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

  const credential = await integrationCredentialDAO.getById(
    integrationCredentialId,
  );
  if (!credential) {
    throw new TicketServiceError(
      TICKET_SERVICE_ERROR_CODE.INTEGRATION_CREDENTIAL_NOT_FOUND,
      `SCM integration credential not found: ${integrationCredentialId}`,
    );
  }

  return credential.secretId;
}

export async function prepareTicketRunContext(
  input: PrepareTicketRunContextInput,
  deps: TicketRunOrchestrationDependencies,
): Promise<PreparedTicketRunContext> {
  const project = await deps.projectDAO.getProject(input.projectId);
  if (!project) {
    throw new Error("Associated project not found");
  }

  const scmConfig = (await deps.projectScmConfigDAO.getByProjectId(
    project.id,
  )) as ProjectScmConfigWithLegacySecret | null;
  const sourceRepository = scmConfig?.sourceRepository.trim() ?? "";
  const baseBranch = scmConfig?.baseBranch.trim() || "main";
  if (!sourceRepository) {
    throw new TicketServiceError(
      TICKET_SERVICE_ERROR_CODE.PROJECT_REPOSITORY_NOT_CONFIGURED,
      "Project has no repository configured",
    );
  }

  const clanker = await deps.clankerDAO.getClanker(input.clankerId);
  if (!clanker) {
    throw new TicketServiceError(
      TICKET_SERVICE_ERROR_CODE.CLANKER_NOT_FOUND,
      "Clanker not found",
    );
  }

  const availability =
    await deps.provisioningService.resolveAvailabilityStatus(clanker);
  const currentStatus = availability.status;
  const currentStatusMessage = availability.statusMessage ?? null;

  if (
    availability.status !== clanker.status ||
    (clanker.statusMessage ?? null) !== currentStatusMessage
  ) {
    await deps.clankerDAO.updateStatus(
      clanker.id,
      availability.status,
      currentStatusMessage,
    );
  }

  if (!clanker.deploymentStrategyId) {
    throw new TicketServiceError(
      TICKET_SERVICE_ERROR_CODE.CLANKER_DEPLOYMENT_STRATEGY_MISSING,
      "Selected clanker has no deployment strategy configured",
    );
  }

  if (currentStatus !== "active") {
    throw new TicketServiceError(
      TICKET_SERVICE_ERROR_CODE.CLANKER_NOT_ACTIVE,
      `Selected clanker is ${currentStatus}. Only active clankers can run jobs.`,
    );
  }

  const scmCredentialSecretId = await resolveScmCredentialSecretId(
    deps.integrationCredentialDAO,
    scmConfig,
  );
  let scmCredentialSecretName: string | null = null;
  if (scmCredentialSecretId) {
    const secretMeta = await deps.secretService.getSecret(scmCredentialSecretId);
    scmCredentialSecretName = secretMeta?.name ?? null;
  }
  const executionClanker: Clanker = {
    ...clanker,
    secretIds: Array.from(
      new Set([
        ...(clanker.secretIds || []),
        ...(scmCredentialSecretId ? [scmCredentialSecretId] : []),
        ...(input.additionalSecretIds ?? []),
      ]),
    ),
  };
  const workerType = getStrategyType(executionClanker);
  const mergedInstructionFiles = mergeInstructionFiles(
    project,
    executionClanker,
    input.instructionFiles || [],
  );
  const workerInstructionFiles: WorkerInstructionFileReference[] =
    workerType === "docker"
      ? mergedInstructionFiles
      : (await deps.instructionStorageService.uploadJobInstructionFiles(
          executionClanker.id,
          input.jobId,
          mergedInstructionFiles as StoredInlineInstructionFile[],
        ));

  return {
    project,
    scmConfig,
    sourceRepository,
    baseBranch,
    clanker,
    executionClanker,
    scmCredentialSecretId,
    scmCredentialSecretName,
    workerType,
    mergedInstructionFiles,
    workerInstructionFiles,
  };
}

// Types for job submission helpers
export interface JobSubmissionDependencies {
  jobService: Pick<
    typeof import("./JobService").JobService.prototype,
    "submitJob" | "saveBootstrapPayload"
  >;
  credentialRequirementsService: Pick<
    typeof import("./CredentialRequirementsService").CredentialRequirementsService.prototype,
    "getRequiredCredentialsForClanker"
  >;
  workerExecutionService: Pick<
    typeof import("../workers/WorkerExecutionService").WorkerExecutionService.prototype,
    "executeJob"
  >;
}

export interface BuildBootstrapPayloadInput {
  workerType: ClankerStrategyType;
  jobKind: string;
  tenantId: string;
  jobId: string;
  clankerId: string;
  agent: Clanker["agent"];
  repository: string;
  task: string;
  branch?: string;
  baseBranch: string | undefined;
  context: unknown;
  settings: unknown;
  instructionFiles: WorkerInstructionFileReference[];
  requiredCredentials: string[];
  callbackToken: string;
  executionClanker: Clanker;
  project: Project;
  scm?: JobScmConfig | null;
}

export function buildBootstrapPayload(input: BuildBootstrapPayloadInput): Record<string, unknown> {
  const {
    workerType,
    jobKind,
    tenantId,
    jobId,
    clankerId,
    agent,
    repository,
    task,
    branch,
    baseBranch,
    context,
    settings,
    instructionFiles,
    requiredCredentials,
    callbackToken,
    executionClanker,
    project,
    scm,
  } = input;

  return {
    workerType,
    jobKind,
    tenantId,
    jobId,
    clankerId,
    agent,
    repository,
    task,
    branch,
    baseBranch,
    context,
    settings,
    instructionFiles,
    requiredCredentials,
    callbackToken,
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
    ...(scm ? { scm } : {}),
  };
}

export function buildScmPayloadFromContext(
  preparedContext: PreparedTicketRunContext,
): JobScmConfig | null {
  const { scmConfig, scmCredentialSecretId, scmCredentialSecretName } = preparedContext;
  if (!scmConfig) return null;
  const payload: JobScmConfig = {
    integrationId: scmConfig.integrationId,
    integrationSystem: scmConfig.integrationSystem,
    sourceRepository: scmConfig.sourceRepository.trim(),
    baseBranch: scmConfig.baseBranch.trim() || "main",
    pullRequestRepository:
      scmConfig.pullRequestRepository?.trim() || scmConfig.sourceRepository.trim(),
    pullRequestBaseBranch:
      scmConfig.pullRequestBaseBranch?.trim() || scmConfig.baseBranch.trim() || "main",
    branchNameTemplate: scmConfig.branchNameTemplate?.trim() || null,
    credentialSecretId: scmCredentialSecretId || undefined,
    credentialSecretName: scmCredentialSecretName || undefined,
  };
  return payload;
}

export async function submitJobWithBootstrapAndInvoke(
  jobData: JobData,
  ticketId: string | undefined,
  clankerId: string,
  phaseLabel: string,
  preparedContext: PreparedTicketRunContext,
  deps: JobSubmissionDependencies,
): Promise<{ jobId: string; status: string }> {
  const { project, executionClanker, workerType, workerInstructionFiles } =
    preparedContext;

  // Submit job to get callback token
  const submitResult = await deps.jobService.submitJob(jobData, {
    ticketId,
    clankerId,
  });
  jobData.callbackToken = submitResult.callbackToken;

  // Get required credentials
  const requiredCredentials =
    await deps.credentialRequirementsService.getRequiredCredentialsForClanker(
      executionClanker,
    );

  const scm = buildScmPayloadFromContext(preparedContext);

  // Build and save bootstrap payload
  const bootstrapPayload = buildBootstrapPayload({
    workerType,
    jobKind: jobData.jobKind,
    tenantId: jobData.tenantId,
    jobId: jobData.id,
    clankerId,
    agent: executionClanker.agent,
    repository: jobData.repository,
    task: jobData.task,
    branch: jobData.branch,
    baseBranch: jobData.baseBranch,
    context: jobData.context,
    settings: jobData.settings,
    instructionFiles: workerInstructionFiles,
    requiredCredentials,
    callbackToken: submitResult.callbackToken,
    executionClanker,
    project,
    scm,
  });

  jobData.bootstrapPayload = bootstrapPayload;
  await deps.jobService.saveBootstrapPayload(jobData.id, bootstrapPayload);

  // Invoke worker (fire-and-forget)
  deps.workerExecutionService
    .executeJob(jobData, executionClanker, project)
    .then((result) => {
      logger.info(`${phaseLabel} worker invoked successfully`, {
        ticketId,
        jobId: jobData.id,
        clankerId: executionClanker.id,
        executionId: result.executionId,
      });
    })
    .catch((error) => {
      logger.error(`${phaseLabel} worker invocation failed`, {
        ticketId,
        jobId: jobData.id,
        clankerId: executionClanker.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

  return {
    jobId: jobData.id,
    status: "active",
  };
}

