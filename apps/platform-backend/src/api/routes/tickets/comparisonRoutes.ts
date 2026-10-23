import type { Router } from "express";
import { isTaskTurnAction } from "@viberglass/types";
import type { TaskComparisonService } from "../../../services/tasks/TaskComparisonService";
import type { TaskComparisonViewService } from "../../../services/tasks/TaskComparisonViewService";
import { validateUuidParam } from "../../middleware/validation";
import { requireRunnerRole } from "../../middleware/workspaceRoleGuards";

const isStringList = (value: unknown): value is string[] => Array.isArray(value) && value.every((entry) => typeof entry === "string");

/** Comparing runners on forks of a task. Registered on the tasks router, so its `:id` guard applies. */
export function registerTaskComparisonRoutes(
  router: Router,
  deps: { comparisons: Pick<TaskComparisonService, "start" | "pickWinner">; views: Pick<TaskComparisonViewService, "view"> },
): void {
  router.get("/:id/comparisons", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.views.view(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/comparisons", requireRunnerRole, validateUuidParam("id"), async (req, res, next) => {
    const { agentIds, message = "", action, fromTurnId } = req.body ?? {};
    if (!isStringList(agentIds)) return res.status(400).json({ error: "agentIds is a list of agent ids" });
    if (typeof message !== "string") return res.status(400).json({ error: "message must be a string" });
    if (action !== undefined && !isTaskTurnAction(action)) return res.status(400).json({ error: "Unknown action" });
    if (fromTurnId !== undefined && typeof fromTurnId !== "string") return res.status(400).json({ error: "fromTurnId must be a string" });
    try {
      await deps.comparisons.start(req.params.id, req.authContext!.user.id, { agentIds, message, action, fromTurnId });
      res.status(201).json({ success: true, data: await deps.views.view(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/comparisons/:comparisonId/winner", requireRunnerRole, validateUuidParam("id"), validateUuidParam("comparisonId"), async (req, res, next) => {
    const ticketId: unknown = req.body?.ticketId ?? null;
    if (ticketId !== null && typeof ticketId !== "string") return res.status(400).json({ error: "ticketId must be a task id or null" });
    try {
      await deps.comparisons.pickWinner(req.params.id, req.params.comparisonId, ticketId, req.authContext!.user.id);
      res.json({ success: true, data: await deps.views.view(req.params.id) });
    } catch (error) {
      next(error);
    }
  });
}
