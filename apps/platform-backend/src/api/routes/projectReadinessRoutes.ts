import type { Router } from "express";
import type { ProjectReadinessService } from "../../services/ProjectReadinessService";
import { validateUuidParam } from "../middleware/validation";
import logger from "../../config/logger";

export function registerProjectReadinessRoutes(
  router: Router,
  projectReadinessService: Pick<ProjectReadinessService, "getReadiness">,
): void {
  router.get(
    "/:projectId/readiness",
    validateUuidParam("projectId"),
    async (req, res) => {
      try {
        const readiness = await projectReadinessService.getReadiness(
          req.params.projectId,
        );
        if (!readiness) {
          return res.status(404).json({ error: "Project not found" });
        }
        return res.json({ success: true, data: readiness });
      } catch (error) {
        logger.error("Error fetching project readiness", {
          projectId: req.params.projectId,
          error: error instanceof Error ? error.message : error,
        });
        return res.status(500).json({ error: "Internal server error" });
      }
    },
  );
}
