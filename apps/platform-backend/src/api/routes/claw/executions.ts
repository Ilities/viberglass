import type { Router } from "express";
import logger from "../../../config/logger";
import type { ClawExecutionService } from "../../../services/claw/ClawExecutionService";
import { validateUuidParam } from "../../middleware/validation";
import { resolveClawServiceError } from "./routeErrors";

interface ClawExecutionRouteDependencies {
  clawExecutionService: ClawExecutionService;
}

export function registerClawExecutionRoutes(
  router: Router,
  { clawExecutionService }: ClawExecutionRouteDependencies,
): void {
  // GET /api/claw/executions - List executions
  router.get("/executions", async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const scheduleId = req.query.scheduleId as string | undefined;
      const status = req.query.status as
        | "pending"
        | "running"
        | "completed"
        | "failed"
        | "cancelled"
        | undefined;

      const result = await clawExecutionService.listExecutions({
        limit,
        offset,
        scheduleId,
        status,
      });

      return res.json({
        success: true,
        data: result.executions,
        pagination: {
          limit,
          offset,
          total: result.total,
        },
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error listing claw executions", {
        error: error.message,
      });

      const serviceError = resolveClawServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to list executions",
      });
    }
  });

  // GET /api/claw/executions/:id - Get a specific execution
  router.get(
    "/executions/:id",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const execution = await clawExecutionService.getExecution(req.params.id);

        return res.json({
          success: true,
          data: execution,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error getting claw execution", {
          error: error.message,
          executionId: req.params.id,
        });

        const serviceError = resolveClawServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to get execution",
        });
      }
    },
  );
}
