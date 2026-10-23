import type { Router } from "express";
import type { AgentTrackRecordService } from "../../services/tasks/AgentTrackRecordService";
import { validateUuidParam } from "../middleware/validation";
import { requireRunnerRole } from "../middleware/workspaceRoleGuards";

export function registerAgentTrackRecordRoutes(router: Router, service: Pick<AgentTrackRecordService, "trackRecord">): void {
  router.get("/:projectId/agent-track-record", requireRunnerRole, validateUuidParam("projectId"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await service.trackRecord(req.params.projectId) });
    } catch (error) {
      next(error);
    }
  });
}
