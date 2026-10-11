import type { Router } from "express";
import type { TaskCopyService } from "../../../services/tasks/TaskCopyService";
import { spaceViewerOf } from "../../middleware/spaceAccessGuards";
import { validateUuidParam } from "../../middleware/validation";
import { requireRunnerRole } from "../../middleware/workspaceRoleGuards";

/** Copying a task into another space. Registered on the tasks router, so its `:id` guard applies. */
export function registerTaskCopyRoutes(router: Router, deps: { copies: Pick<TaskCopyService, "copy"> }): void {
  router.post("/:id/copy", requireRunnerRole, validateUuidParam("id"), async (req, res, next) => {
    const spaceId: unknown = req.body?.spaceId;
    if (typeof spaceId !== "string" || !spaceId.trim()) return res.status(400).json({ error: "spaceId is required" });
    try {
      res.status(201).json({ success: true, data: await deps.copies.copy(req.params.id, spaceId.trim(), spaceViewerOf(req)!) });
    } catch (error) {
      next(error);
    }
  });
}
