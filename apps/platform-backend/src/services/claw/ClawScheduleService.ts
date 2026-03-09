import logger from "../../config/logger";
import { ClawScheduleDAO } from "../../persistence/claw/ClawScheduleDAO";
import { ClawTaskTemplateDAO } from "../../persistence/claw/ClawTaskTemplateDAO";
import { ProjectDAO } from "../../persistence/project/ProjectDAO";
import type {
  ClawScheduleSummary,
  CreateClawScheduleRequest,
  UpdateClawScheduleRequest,
  ClawScheduleListParams,
} from "@viberglass/types";
import {
  ClawSchedule,
  intervalToCron,
  isValidCronExpression,
} from "@viberglass/types";
import {
  ClawServiceError,
  CLAW_SERVICE_ERROR_CODE,
} from "../errors/ClawServiceError";

export class ClawScheduleService {
  private scheduleDAO = new ClawScheduleDAO();
  private templateDAO = new ClawTaskTemplateDAO();
  private projectDAO = new ProjectDAO();

  async createSchedule(
    request: CreateClawScheduleRequest,
    actor?: string,
  ): Promise<ClawSchedule> {
    const project = await this.projectDAO.getProject(request.projectId);
    if (!project) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.PROJECT_NOT_FOUND,
        "Project not found",
      );
    }

    // Validate template exists
    const template = await this.templateDAO.getTemplate(request.taskTemplateId);
    if (!template) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.TEMPLATE_NOT_FOUND,
        "Task template not found",
      );
    }

    if (request.scheduleType === "interval") {
      if (!request.intervalExpression) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.INVALID_INTERVAL_EXPRESSION,
          "Interval expression is required for interval schedules",
        );
      }
      const cronExpr = intervalToCron(request.intervalExpression);
      if (!cronExpr) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.INVALID_INTERVAL_EXPRESSION,
          "Invalid interval expression. Use format like '5m', '1h', '1d', '1w'",
        );
      }
      if (!request.cronExpression) {
        request.cronExpression = cronExpr;
      }
    } else if (request.scheduleType === "cron") {
      if (!request.cronExpression) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.INVALID_CRON_EXPRESSION,
          "Cron expression is required for cron schedules",
        );
      }
      if (!isValidCronExpression(request.cronExpression)) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.INVALID_CRON_EXPRESSION,
          "Invalid cron expression. Format: sec min hour day month dow",
        );
      }
    }

    const existingSchedule = await this.scheduleDAO.getScheduleByProjectAndName(
      request.projectId,
      request.name,
    );
    if (existingSchedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.INVALID_SCHEDULE_TYPE,
        "A schedule with this name already exists in this project",
      );
    }

    const schedule = await this.scheduleDAO.createSchedule(request, actor);

    logger.info("Claw schedule created", {
      scheduleId: schedule.id,
      projectId: request.projectId,
      scheduleType: request.scheduleType,
    });

    return schedule;
  }

  async getSchedule(id: string): Promise<ClawSchedule> {
    const schedule = await this.scheduleDAO.getSchedule(id);
    if (!schedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
        "Schedule not found",
      );
    }
    return schedule;
  }

  async listSchedules(
    params: ClawScheduleListParams = {},
  ): Promise<{ schedules: ClawScheduleSummary[]; total: number }> {
    if (params.projectId) {
      const project = await this.projectDAO.getProject(params.projectId);
      if (!project) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.PROJECT_NOT_FOUND,
          "Project not found",
        );
      }
    }

    const result = await this.scheduleDAO.getSchedulesWithFilters({
      limit: params.limit,
      offset: params.offset,
      projectId: params.projectId,
      isActive: params.isActive,
      scheduleType: params.scheduleType,
    });

    return {
      schedules: result.schedules.map((s) => ({
        id: s.id,
        projectId: s.projectId,
        taskTemplateId: s.taskTemplateId,
        name: s.name,
        description: s.description,
        scheduleType: s.scheduleType,
        intervalExpression: s.intervalExpression,
        cronExpression: s.cronExpression,
        timezone: s.timezone,
        isActive: s.isActive,
        lastRunAt: s.lastRunAt,
        nextRunAt: s.nextRunAt,
        runCount: s.runCount,
        failureCount: s.failureCount,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      })),
      total: result.total,
    };
  }

  async updateSchedule(
    id: string,
    updates: UpdateClawScheduleRequest,
  ): Promise<ClawSchedule> {
    const schedule = await this.scheduleDAO.getSchedule(id);
    if (!schedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
        "Schedule not found",
      );
    }

    // If changing name, validate uniqueness
    if (updates.name && updates.name !== schedule.name) {
      const existingSchedule =
        await this.scheduleDAO.getScheduleByProjectAndName(
          schedule.projectId,
          updates.name,
        );
      if (existingSchedule && existingSchedule.id !== id) {
        throw new ClawServiceError(
          CLAW_SERVICE_ERROR_CODE.INVALID_SCHEDULE_TYPE,
          "A schedule with this name already exists in this project",
        );
      }
    }

    const scheduleType = updates.scheduleType ?? schedule.scheduleType;
    if (
      updates.scheduleType ||
      updates.intervalExpression ||
      updates.cronExpression
    ) {
      if (scheduleType === "interval") {
        const intervalExpr =
          updates.intervalExpression ?? schedule.intervalExpression;
        if (!intervalExpr) {
          throw new ClawServiceError(
            CLAW_SERVICE_ERROR_CODE.INVALID_INTERVAL_EXPRESSION,
            "Interval expression is required for interval schedules",
          );
        }
        const cronExpr = intervalToCron(intervalExpr);
        if (!cronExpr) {
          throw new ClawServiceError(
            CLAW_SERVICE_ERROR_CODE.INVALID_INTERVAL_EXPRESSION,
            "Invalid interval expression. Use format like '5m', '1h', '1d', '1w'",
          );
        }
      } else if (scheduleType === "cron") {
        const cronExpr = updates.cronExpression ?? schedule.cronExpression;
        if (!cronExpr) {
          throw new ClawServiceError(
            CLAW_SERVICE_ERROR_CODE.INVALID_CRON_EXPRESSION,
            "Cron expression is required for cron schedules",
          );
        }
        if (!isValidCronExpression(cronExpr)) {
          throw new ClawServiceError(
            CLAW_SERVICE_ERROR_CODE.INVALID_CRON_EXPRESSION,
            "Invalid cron expression. Format: sec min hour day month dow",
          );
        }
      }
    }

    const updatedSchedule = await this.scheduleDAO.updateSchedule(id, updates);

    logger.info("Claw schedule updated", { scheduleId: id });

    return updatedSchedule;
  }

  async deleteSchedule(id: string): Promise<void> {
    const schedule = await this.scheduleDAO.getSchedule(id);
    if (!schedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
        "Schedule not found",
      );
    }

    // Note: The database cascade will delete associated executions
    await this.scheduleDAO.deleteSchedule(id);

    logger.info("Claw schedule deleted", { scheduleId: id });
  }

  async pauseSchedule(id: string): Promise<ClawSchedule> {
    const schedule = await this.scheduleDAO.getSchedule(id);
    if (!schedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
        "Schedule not found",
      );
    }

    if (!schedule.isActive) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_ALREADY_PAUSED,
        "Schedule is already paused",
      );
    }

    const pausedSchedule = await this.scheduleDAO.pauseSchedule(id);

    logger.info("Claw schedule paused", { scheduleId: id });

    return pausedSchedule;
  }

  async resumeSchedule(id: string): Promise<ClawSchedule> {
    const schedule = await this.scheduleDAO.getSchedule(id);
    if (!schedule) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_NOT_FOUND,
        "Schedule not found",
      );
    }

    if (schedule.isActive) {
      throw new ClawServiceError(
        CLAW_SERVICE_ERROR_CODE.SCHEDULE_ALREADY_ACTIVE,
        "Schedule is already active",
      );
    }

    const resumedSchedule = await this.scheduleDAO.resumeSchedule(id);

    logger.info("Claw schedule resumed", { scheduleId: id });

    return resumedSchedule;
  }
}
