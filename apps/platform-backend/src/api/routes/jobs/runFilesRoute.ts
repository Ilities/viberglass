import type { Router } from "express";
import logger from "../../../config/logger";
import type { SpaceFilesRunService } from "../../../services/spaceFiles/SpaceFilesRunService";
import { requireAuth } from "../../middleware/authentication";

/** What a Files run saved and the artifacts it made, for the people who can see the run. */
export function registerRunFilesRoute(router: Router, files: Pick<SpaceFilesRunService, "summaryForJob" | "artifactsForJob">): void {
  router.get("/:jobId/files", requireAuth, async (req, res) => {
    const { jobId } = req.params;
    try {
      const saved = await files.summaryForJob(jobId);
      const artifacts = saved ? await files.artifactsForJob(jobId) : [];
      return res.json({ success: true, data: { files: saved, artifacts } });
    } catch (error) {
      logger.error("Failed to get a run's files", { jobId, error: error instanceof Error ? error.message : String(error) });
      return res.status(500).json({ error: "Failed to get the run's files" });
    }
  });
}
