import logger from "../../config/logger";
import { ClawExecutionDAO } from "../../persistence/claw/ClawExecutionDAO";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import type {
  ClawExecution,
  ClawExecutionListParams,
  ClawExecutionSummary,
} from "@viberglass/types";
import {
  CLAW_SERVICE_ERROR_CODE,
  ClawServiceError,
} from "../errors/ClawServiceError";

export class ClawExecutionService {
  private executionDAO = new ClawExecutionDAO();
  private scheduleDAO = new ClawScheduleDAO();

  async createExecution(scheduleId: string): Promise<ClawExecution> {
    const schedule = await this.scheduleDAO.getSchedule(scheduleId);
    if (!schedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
        "Schedule not found",
      );
    }

    const execution = await this.executionDAO.createExecution(scheduleId);

    logger.info("Claw execution created", {
      executionId: execution.id,
      scheduleId,
    });

    return execution;
  }

  async getExecution(id: string): Promise<ClawExecution> {
    const execution = await this.executionDAO.getExecution(id);
    if (!execution) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.EXECUTION_NOT_FOUND,
        "Execution not found",
      );
    }
    return execution;
  }

  async listExecutions(
    params: ClawExecutionListParams = {},
  ): Promise<{ executions: ClawExecutionSummary[]; total: number }> {
    if (params.scheduleId) {
      const schedule = await this.scheduleDAO.getSchedule(params.scheduleId);
      if (!schedule) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
          "Schedule not found",
        );
      }
    }

    const result = await this.executionDAO.getExecutionsWithFilters({
      limit: params.limit,
      offset: params.offset,
      scheduleId: params.scheduleId,
      status: params.status,
    });

    return {
      executions: result.executions.map((e) => ({
        id: e.id,
        scheduleId: e.scheduleId,
        jobId: e.jobId,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        createdAt: e.createdAt,
      })),
      total: result.total,
    };
  }

  async linkExecutionToJob(
    executionId: string,
    jobId: string,
  ): Promise<ClawExecution> {
    const execution = await this.executionDAO.getExecution(executionId);
    if (!execution) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.EXECUTION_NOT_FOUND,
        "Execution not found",
      );
    }

    return this.executionDAO.updateExecution(executionId, {
      status: "running",
      jobId,
      startedAt: new Date(),
    });
  }

  async recordExecutionResult(
    executionId: string,
    result: {
      status: "completed" | "failed" | "cancelled";
      result?: Record<string, unknown>;
      errorMessage?: string;
    },
  ): Promise<ClawExecution> {
    const execution = await this.executionDAO.getExecution(executionId);
    if (!execution) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.EXECUTION_NOT_FOUND,
        "Execution not found",
      );
    }

    const updatedExecution = await this.executionDAO.updateExecution(
      executionId,
      {
        status: result.status,
        completedAt: new Date(),
        result: result.result ?? null,
        errorMessage: result.errorMessage ?? null,
      },
    );

    if (result.status === "completed") {
      await this.scheduleDAO.incrementRunCount(execution.scheduleId);
    } else if (result.status === "failed") {
      await this.scheduleDAO.incrementFailureCount(execution.scheduleId);
    }

    logger.info("Claw execution completed", {
      executionId,
      scheduleId: execution.scheduleId,
      status: result.status,
    });

    return updatedExecution;
  }

  async updateWebhookDeliveryStatus(
    executionId: string,
    webhookDeliveryStatus: {
      started?: {
        success: boolean;
        statusCode?: number;
        errorMessage?: string;
        sentAt?: string;
      };
      completed?: {
        success: boolean;
        statusCode?: number;
        errorMessage?: string;
        sentAt?: string;
      };
      failed?: {
        success: boolean;
        statusCode?: number;
        errorMessage?: string;
        sentAt?: string;
      };
    },
  ): Promise<void> {
    const execution = await this.executionDAO.getExecution(executionId);
    if (!execution) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.EXECUTION_NOT_FOUND,
        "Execution not found",
      );
    }

    await this.executionDAO.updateExecution(executionId, {
      webhookDeliveryStatus,
    });
  }
}
