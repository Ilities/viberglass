import type { Router } from "express";
import type { TaskDiscussionService } from "../../../services/tasks/TaskDiscussionService";
import type { TaskActivityDAO } from "../../../persistence/ticketing/TaskActivityDAO";
import { validateUuidParam } from "../../middleware/validation";

/**
 * A task's Discussion and Activity. Registered on the tasks router, so its
 * `:id` guard applies; viewers are refused posting by the global guard.
 */
export function registerTaskDiscussionRoutes(
  router: Router,
  deps: { discussion: TaskDiscussionService; activity: Pick<TaskActivityDAO, "list"> },
): void {
  router.get("/:id/messages", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.discussion.list(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/messages", validateUuidParam("id"), async (req, res, next) => {
    const body: unknown = req.body?.body;
    if (typeof body !== "string") return res.status(400).json({ error: "body is required" });
    try {
      res.status(201).json({ success: true, data: await deps.discussion.post(req.params.id, req.authContext!.user.id, body) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/activity", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.activity.list(req.params.id) });
    } catch (error) {
      next(error);
    }
  });
}
