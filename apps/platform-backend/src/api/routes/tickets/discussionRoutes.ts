import type { Router } from "express";
import type { TaskDiscussionService } from "../../../services/tasks/TaskDiscussionService";
import type { TaskTimelineService } from "../../../services/tasks/TaskTimelineService";
import { validateUuidParam } from "../../middleware/validation";

/**
 * A task's thread, and posting to it. Registered on the tasks router, so its
 * `:id` guard applies; viewers are refused posting by the global guard.
 */
export function registerTaskDiscussionRoutes(
  router: Router,
  deps: { discussion: TaskDiscussionService; timeline: Pick<TaskTimelineService, "list"> },
): void {
  router.post("/:id/messages", validateUuidParam("id"), async (req, res, next) => {
    const body: unknown = req.body?.body;
    if (typeof body !== "string") return res.status(400).json({ error: "body is required" });
    try {
      res.status(201).json({ success: true, data: await deps.discussion.post(req.params.id, req.authContext!.user.id, body) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/timeline", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.timeline.list(req.params.id) });
    } catch (error) {
      next(error);
    }
  });
}
