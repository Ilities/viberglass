import type { Router } from "express";
import logger from "../../../config/logger";
import { ClawTaskTemplateDAO } from "../../../persistence/claw/ClawTaskTemplateDAO";
import { ClawScheduleDAO } from "../../../persistence/claw/ClawScheduleDAO";
import { ClawExecutionDAO } from "../../../persistence/claw/ClawExecutionDAO";
import type { ClawStats, ClawExecutionSummary } from "@viberglass/types";

interface ClawStatsRouteDependencies {
  clawTemplateDAO?: ClawTaskTemplateDAO;
  clawScheduleDAO?: ClawScheduleDAO;
  clawExecutionDAO?: ClawExecutionDAO;
}

export function registerClawStatsRoutes(
  router: Router,
  deps: ClawStatsRouteDependencies = {},
): void {
  const clawTemplateDAO = deps.clawTemplateDAO ?? new ClawTaskTemplateDAO();
  const clawScheduleDAO = deps.clawScheduleDAO ?? new ClawScheduleDAO();
  const clawExecutionDAO = deps.clawExecutionDAO ?? new ClawExecutionDAO();

  router.get("/stats", async (req, res) => {
    try {
      const templates = await clawTemplateDAO.getTemplatesWithFilters({
        limit: 1,
        offset: 0,
      });
      const schedules = await clawScheduleDAO.getSchedulesWithFilters({
        limit: 1,
        offset: 0,
      });
      const executions = await clawExecutionDAO.getExecutionsWithFilters({
        limit: 1,
        offset: 0,
      });

      const executionsByStatus = await clawExecutionDAO.getExecutionStats();

      const recentExecutionsResult =
        await clawExecutionDAO.getExecutionsWithFilters({
          limit: 10,
          offset: 0,
        });

      const recentExecutions: ClawExecutionSummary[] =
        recentExecutionsResult.executions.map((e) => ({
          id: e.id,
          scheduleId: e.scheduleId,
          jobId: e.jobId,
          status: e.status,
          startedAt: e.startedAt,
          completedAt: e.completedAt,
          createdAt: e.createdAt,
        }));

      const activeSchedules = await clawScheduleDAO.getSchedulesWithFilters({
        limit: 1,
        offset: 0,
        isActive: true,
      });

      const stats: ClawStats = {
        totalTemplates: templates.total,
        totalSchedules: schedules.total,
        activeSchedules: activeSchedules.total,
        totalExecutions: executions.total,
        executionsByStatus,
        recentExecutions,
      };

      return res.json({
        success: true,
        data: stats,
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error("Error getting claw stats", {
        error: error.message,
      });

      return res.status(500).json({
        error: "Internal server error",
        message: error.message || "Failed to get stats",
      });
    }
  });
}
