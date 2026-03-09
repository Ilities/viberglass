import express from "express";
import type { Request, Response, NextFunction } from "express";
import { ClawTaskTemplateService } from "../../../services/claw/ClawTaskTemplateService";
import { ClawScheduleService } from "../../../services/claw/ClawScheduleService";
import { ClawExecutionService } from "../../../services/claw/ClawExecutionService";
import { ClawSchedulingEngine } from "../../../services/claw/ClawSchedulingEngine";
import { requireAuth } from "../../middleware/authentication";
import { registerClawTaskTemplateRoutes } from "./task-templates";
import { registerClawScheduleRoutes } from "./schedules";
import { registerClawExecutionRoutes } from "./executions";
import { registerClawStatsRoutes } from "./stats";

const router = express.Router();

const clawTaskTemplateService = new ClawTaskTemplateService();
const clawScheduleService = new ClawScheduleService();
const clawExecutionService = new ClawExecutionService();
const clawSchedulingEngine = ClawSchedulingEngine.getInstance();

router.use(requireAuth);

/**
 * Wraps an async route handler so thrown errors propagate to Express error middleware.
 */
function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    return fn(req, res, next).catch(next);
  };
}

registerClawTaskTemplateRoutes(router, { clawTaskTemplateService });
registerClawScheduleRoutes(router, {
  clawScheduleService,
  clawSchedulingEngine,
});
registerClawExecutionRoutes(router, { clawExecutionService });
registerClawStatsRoutes(router);

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const engineStatus = clawSchedulingEngine.getStatus();

    res.json({
      name: "Viberglass Claw API",
      version: "1.0.0",
      description: "Scheduled task execution system",
      schedulingEngine: {
        isRunning: engineStatus.isRunning,
        activeSchedules: engineStatus.activeSchedules,
      },
      endpoints: {
        taskTemplates: "/api/claw/task-templates",
        schedules: "/api/claw/schedules",
        executions: "/api/claw/executions",
        stats: "/api/claw/stats",
      },
    });
  }),
);

export default router;
