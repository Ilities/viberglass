import { randomUUID } from "crypto";
import logger from "../config/logger";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { ProjectDAO } from "../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../persistence/project/ProjectScmConfigDAO";
import { IntegrationCredentialDAO } from "../persistence/integrations";
import { SecretService } from "./SecretService";
import { ClankerDAO } from "../persistence/clanker/ClankerDAO";
import { getClankerProvisioner } from "../provisioning/provisioningFactory";
import { JobService } from "./JobService";
import { CredentialRequirementsService } from "./CredentialRequirementsService";
import { WorkerExecutionService } from "../workers";
import { JobData, TicketJobData } from "../types/Job";
import { TICKET_WORKFLOW_PHASE } from "@viberglass/types";
import { TicketMediaExecutionService } from "./TicketMediaExecutionService";
import { InstructionStorageService } from "./instructions/InstructionStorageService";
import { TicketPhaseDocumentService } from "./TicketPhaseDocumentService";
import {
  TICKET_SERVICE_ERROR_CODE,
  TicketServiceError,
} from "./errors/TicketServiceError";
import {
  type InlineInstructionFile,
  buildScmPayloadFromContext,
  prepareTicketRunContext,
} from "./ticketRunOrchestration";
import { PromptTemplateService } from "./PromptTemplateService";
import {
  PromptTemplateDAO,
  PROMPT_TYPE,
} from "../persistence/promptTemplate/PromptTemplateDAO";

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
  private secretService = new SecretService();
  private clankerDAO = new ClankerDAO();
  private provisioningService = getClankerProvisioner();
  private jobService = new JobService();
  private credentialRequirementsService = new CredentialRequirementsService();
  private workerExecutionService = new WorkerExecutionService();
  private ticketMediaExecutionService = new TicketMediaExecutionService();
  private instructionStorageService = new InstructionStorageService();
  private ticketPhaseDocumentService = new TicketPhaseDocumentService();
  private promptTemplateService = new PromptTemplateService(new PromptTemplateDAO());

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
        throw new TicketServiceError(
          TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND,
          "Ticket not found",
        );
      }

      const planningDocument =
        await this.ticketPhaseDocumentService.getOrCreateDocument(
          ticketId,
          TICKET_WORKFLOW_PHASE.PLANNING,
        );
      if (
        planningDocument.approvalState !== "approved" &&
        !ticket.workflowOverriddenAt
      ) {
        throw new TicketServiceError(
          TICKET_SERVICE_ERROR_CODE.EXECUTION_BLOCKED_UNAPPROVED_PLAN,
          "Execution is blocked until the planning document is approved",
        );
      }

      const researchDocument =
        await this.ticketPhaseDocumentService.getOrCreateDocument(
          ticketId,
          TICKET_WORKFLOW_PHASE.RESEARCH,
        );

      // Generate jobId before instruction materialization so non-docker workers can upload by job path
      const jobId = `job_${Date.now()}_${randomUUID().slice(0, 8)}`;
      const {
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
      } = await prepareTicketRunContext(
        {
          projectId: ticket.projectId,
          clankerId,
          jobId,
          instructionFiles: instructionFiles || [],
        },
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

      const normalizedScmConfigWithCredential = buildScmPayloadFromContext({
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
      });
      const ticketMediaExecution =
        await this.ticketMediaExecutionService.prepareForExecution(
          ticket,
          executionClanker,
        );

      const task = await this.promptTemplateService.render(
        PROMPT_TYPE.ticket_developing,
        ticket.projectId,
        {
          externalTicketId: ticket.externalTicketId ?? undefined,
          ticketTitle: ticket.title,
          ticketDescription: ticket.description,
          researchDocument: researchDocument.content || undefined,
          planDocument: planningDocument.content || undefined,
        },
      );

      // Create job via JobService.submitJob with ticket and clanker references
      const jobData: TicketJobData = {
        id: jobId,
        jobKind: "execution",
        tenantId: "api-server", // Hardcoded for now, per RESEARCH.md
        repository: sourceRepository,
        task,
        branch: undefined, // Worker creates branch
        baseBranch,
        context: {
          ticketId: ticket.id,
          originalTicketId: ticket.externalTicketId || ticket.id,
          stepsToReproduce: ticket.description,
          researchDocument: researchDocument.content,
          planDocument: planningDocument.content,
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
        jobKind: jobData.jobKind,
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
        .executeJob(jobData, executionClanker, project)
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
