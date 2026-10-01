import type { Router } from "express";
import type { TaskAskPolicyService } from "../../../services/taskTurns/TaskAskPolicyService";
import { validateUuidParam } from "../../middleware/validation";

/**
 * What the caller may ask the agent for on a task, so the page offers only
 * what the server would accept. Registered on the tasks router, so its `:id`
 * guard hides tasks in spaces the caller can't see.
 */
export function registerTaskCapabilityRoutes(router: Router, deps: { policy: Pick<TaskAskPolicyService, "describe"> }): void {
  router.get("/:id/capabilities", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.policy.describe(req.authContext!.user.id, req.params.id) });
    } catch (error) {
      next(error);
    }
  });
}
