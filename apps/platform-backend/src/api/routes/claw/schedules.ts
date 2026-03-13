import type { Router } from "express";
import logger from "../../../config/logger";
import type { ClawScheduleService } from "../../../services/claw/ClawScheduleService";
import type { ClawSchedulingEngine } from "../../../services/claw/ClawSchedulingEngine";
import { validateUuidParam } from "../../middleware/validation";
import {
  validateCreateClawSchedule,
  validateUpdateClawSchedule,
} from "../../middleware/validation";
import { resolveClawServiceError } from "./routeErrors";

interface ClawScheduleRouteDependencies {
  clawScheduleService: ClawScheduleService;
  clawSchedulingEngine: ClawSchedulingEngine;
}

export function registerClawScheduleRoutes(
  router: Router,
  { clawScheduleService, clawSchedulingEngine }: ClawScheduleRouteDependencies,
) {
  router.post("/schedules", validateCreateClawSchedule, async (req, res) => {
    try {
      const actor = req.auth?.user.id;
      const schedule = await clawScheduleService.createSchedule(
        req.body,
        actor,
      );

      await clawSchedulingEngine.triggerRefresh();

      return res.status(201).json({
        success: true,
        data: schedule,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error creating claw schedule", {
        error: error.message,
      });

      const serviceError = resolveClawServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to create schedule",
      });
    }
  });

  router.get("/schedules", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const projectId = req.query.projectId as string | undefined;
      const isActive = req.query.isActive as string | undefined;
      const scheduleType = req.query.scheduleType as
        | "interval"
        | "cron"
        | undefined;

      const result = await clawScheduleService.listSchedules({
        limit,
        offset,
        projectId,
        isActive: isActive !== undefined ? isActive === "true" : undefined,
        scheduleType,
      });

      return res.json({
        success: true,
        data: result.schedules,
        pagination: {
          limit,
          offset,
          total: result.total,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error listing claw schedules", {
        error: error.message,
      });

      const serviceError = resolveClawServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to list schedules",
      });
    }
  });

  router.get("/schedules/:id", validateUuidParam("id"), async (req, res) => {
    try {
      const schedule = await clawScheduleService.getSchedule(req.params.id);

      return res.json({
        success: true,
        data: schedule,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error getting claw schedule", {
        error: error.message,
        scheduleId: req.params.id,
      });

      const serviceError = resolveClawServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to get schedule",
      });
    }
  });

  router.put(
    "/schedules/:id",
    validateUuidParam("id"),
    validateUpdateClawSchedule,
    async (req, res) => {
      try {
        const schedule = await clawScheduleService.updateSchedule(
          req.params.id,
          req.body,
        );

        await clawSchedulingEngine.triggerRefresh();

        return res.json({
          success: true,
          data: schedule,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error updating claw schedule", {
          error: error.message,
          scheduleId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to update schedule",
        });
      }
    },
  );

  router.delete("/schedules/:id", validateUuidParam("id"), async (req, res) => {
    try {
      await clawScheduleService.deleteSchedule(req.params.id);
      await clawSchedulingEngine.triggerRefresh();

      return res.status(204).send();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error deleting claw schedule", {
        error: error.message,
        scheduleId: req.params.id,
      });

      const serviceError = resolveClawServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to delete schedule",
      });
    }
  });

  router.post(
    "/schedules/:id/pause",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const schedule = await clawScheduleService.pauseSchedule(req.params.id);
        await clawSchedulingEngine.triggerRefresh();

        return res.json({
          success: true,
          data: schedule,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error pausing claw schedule", {
          error: error.message,
          scheduleId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to pause schedule",
        });
      }
    },
  );

  router.post(
    "/schedules/:id/resume",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const schedule = await clawScheduleService.resumeSchedule(
          req.params.id,
        );
        await clawSchedulingEngine.triggerRefresh();

        return res.json({
          success: true,
          data: schedule,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error resuming claw schedule", {
          error: error.message,
          scheduleId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to resume schedule",
        });
      }
    },
  );
}
