import { randomUUID } from "crypto";
import logger from "../../config/logger";
import { ClawTaskTemplateDAO } from "../../persistence/claw/ClawTaskTemplateDAO";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import { ProjectScmConfigDAO } from "../../persistence/project/ProjectScmConfigDAO";
import { IntegrationCredentialDAO } from "../../persistence/integrations";
import { ClankerDAO } from "../../persistence/clanker/ClankerDAO";
import { getClankerProvisioner } from "../../provisioning/provisioningFactory";
import { JobService } from "../JobService";
import { CredentialRequirementsService } from "../CredentialRequirementsService";
import { WorkerExecutionService } from "../../workers";
import { InstructionStorageService } from "../instructions/InstructionStorageService";
import {
  CLAW_SERVICE_ERROR_CODE,
  ClawServiceError,
} from "../errors/ClawServiceError";
import type { InlineInstructionFile } from "../ticketRunOrchestration";
import {
  prepareTicketRunContext,
  submitJobWithBootstrapAndInvoke,
} from "../ticketRunOrchestration";
import { ClawExecutionService } from "./ClawExecutionService";
import type { ClawJobData } from "../../types/Job";
import { ClawWebhookService } from "./ClawWebhookService";
import { PromptTemplateService } from "../PromptTemplateService";
import {
  PromptTemplateDAO,
  PROMPT_TYPE,
} from "../../persistence/promptTemplate/PromptTemplateDAO";

export class ClawOrchestrationService {
  private projectDAO = new ProjectDAO();
  private projectScmConfigDAO = new ProjectScmConfigDAO();
  private integrationCredentialDAO = new IntegrationCredentialDAO();
  private clankerDAO = new ClankerDAO();
  private clawTemplateDAO = new ClawTaskTemplateDAO();
  private clawScheduleDAO = new ClawScheduleDAO();
  private clawExecutionService = new ClawExecutionService();
  private provisioningService = getClankerProvisioner();
  private jobService = new JobService();
  private credentialRequirementsService = new CredentialRequirementsService();
  private workerExecutionService = new WorkerExecutionService();
  private instructionStorageService = new InstructionStorageService();
  private webhookService = new ClawWebhookService();
  private promptTemplateService = new PromptTemplateService(new PromptTemplateDAO());

  /**
   * Execute a scheduled claw task
   * This is the main entry point for the scheduling engine
   */
  async executeScheduledTask(
    scheduleId: string,
  ): Promise<{ executionId: string; jobId?: string }> {
    const execution =
      await this.clawExecutionService.createExecution(scheduleId);

    logger.info("Executing claw task", {
      executionId: execution.id,
      scheduleId,
    });

    try {
      const schedule = await this.clawScheduleDAO.getSchedule(scheduleId);
      if (!schedule) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
          "Schedule not found",
        );
      }

      const template = await this.clawTemplateDAO.getTemplate(
        schedule.taskTemplateId,
      );
      if (!template) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.TEMPLATE_NOT_FOUND,
          "Task template not found",
        );
      }

      await this.webhookService.sendWebhook(schedule, execution, "started");

      const jobId = `claw_${Date.now()}_${randomUUID().slice(0, 8)}`;

      const instructionFiles: InlineInstructionFile[] = [
        {
          fileType: "TASK.md",
          content: template.taskInstructions,
        },
      ];

      const preparedContext = await prepareTicketRunContext(
        {
          projectId: template.projectId,
          clankerId: template.clankerId,
          jobId,
          instructionFiles,
          additionalSecretIds: template.secretIds,
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

      const task = await this.promptTemplateService.render(
        PROMPT_TYPE.claw_scheduled_task,
        template.projectId,
        { taskInstructions: template.taskInstructions },
      );

      // Build job data
      const jobData: ClawJobData = {
        id: jobId,
        jobKind: "claw",
        tenantId: preparedContext.project.id,
        repository: preparedContext.sourceRepository,
        task,
        branch: preparedContext.baseBranch,
        baseBranch: preparedContext.baseBranch,
        context: {
          clawExecutionId: execution.id,
          clawScheduleId: scheduleId,
          clawTemplateName: template.name,
        },
        settings: preparedContext.project.workerSettings || {},
        timestamp: Date.now(),
      };

      await submitJobWithBootstrapAndInvoke(
        jobData,
        undefined,
        template.clankerId,
        "Claw Task",
        preparedContext,
        {
          jobService: this.jobService,
          credentialRequirementsService: this.credentialRequirementsService,
          workerExecutionService: this.workerExecutionService,
        },
      );

      await this.clawExecutionService.linkExecutionToJob(execution.id, jobId);
      await this.clawScheduleDAO.updateLastRun(scheduleId, new Date());

      logger.info("Claw task started successfully", {
        executionId: execution.id,
        scheduleId,
        jobId,
      });

      return { executionId: execution.id, jobId };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await this.clawExecutionService.recordExecutionResult(execution.id, {
        status: "failed",
        errorMessage,
      });

      const sched = await this.clawScheduleDAO.getSchedule(scheduleId);
      await this.webhookService.sendWebhook(sched!, execution, "failed", {
        errorMessage,
      });

      throw error;
    }
  }

  /**
   * Handle job completion callback from worker
   * Called when a claw job completes
   */
  async handleJobCompletion(
    executionId: string,
    jobId: string,
    result: {
      success: boolean;
      result?: Record<string, unknown>;
      errorMessage?: string;
    },
  ): Promise<void> {
    logger.info("Claw job completion", {
      executionId,
      jobId,
      success: result.success,
    });

    // Get execution to find schedule
    const execution = await this.clawExecutionService.getExecution(executionId);
    if (!execution) {
      logger.warn("Claw execution not found for job completion", {
        executionId,
        jobId,
      });
      return;
    }

    const schedule = await this.clawScheduleDAO.getSchedule(
      execution.scheduleId,
    );
    if (!schedule) {
      logger.warn("Claw schedule not found for job completion", {
        scheduleId: execution.scheduleId,
        executionId,
      });
      return;
    }

    // Record execution result
    const status = result.success ? "completed" : "failed";
    await this.clawExecutionService.recordExecutionResult(executionId, {
      status,
      result: result.result,
      errorMessage: result.errorMessage,
    });

    // Send completion webhook
    await this.webhookService.sendWebhook(
      schedule,
      await this.clawExecutionService.getExecution(executionId),
      result.success ? "completed" : "failed",
      result.result
        ? { result: result.result }
        : { errorMessage: result.errorMessage },
    );

    logger.info("Claw job completion processed", {
      executionId,
      jobId,
      status,
    });
  }
}
