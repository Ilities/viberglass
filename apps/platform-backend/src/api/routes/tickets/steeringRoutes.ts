import type { Router } from "express";
import { isTaskTurnAction } from "@viberglass/types";
import type { TaskCodeBranchService } from "../../../services/tasks/TaskCodeBranchService";
import type { TaskTakeoverService } from "../../../services/tasks/TaskTakeoverService";
import type { PausedRunRetryService } from "../../../services/taskTurns/PausedRunRetryService";
import type { TaskSteeringService } from "../../../services/taskTurns/TaskSteeringService";
import { validateUuidParam } from "../../middleware/validation";

/**
 * Steering the agent on a task: interrupting its turn with a message, pausing
 * and resuming it, and taking its work over and handing it back. Registered on
 * the tasks router, so its `:id` guard applies; who may steer is the services' to check.
 */
export function registerTaskSteeringRoutes(
  router: Router,
  deps: {
    steering: Pick<TaskSteeringService, "interrupt" | "pause" | "resume" | "resumeTarget">;
    takeover: Pick<TaskTakeoverService, "takeOver" | "handBack">;
    branches: Pick<TaskCodeBranchService, "describe">;
    pausedRuns: Pick<PausedRunRetryService, "pausedTaskIds" | "retryAll">;
  },
): void {
  // Runs a setup failure paused, for an admin to try again once it's fixed.
  router.get("/paused-runs", async (req, res, next) => {
    if (req.authContext?.user.role !== "admin") return res.status(403).json({ error: "Only workspace admins see paused runs" });
    try {
      res.json({ success: true, data: { taskIds: await deps.pausedRuns.pausedTaskIds() } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/paused-runs/retry", async (req, res, next) => {
    if (req.authContext?.user.role !== "admin") return res.status(403).json({ error: "Only workspace admins can retry every paused run" });
    try {
      res.json({ success: true, data: { retried: await deps.pausedRuns.retryAll(req.authContext.user.id) } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/agent/interrupt", validateUuidParam("id"), async (req, res, next) => {
    const body: unknown = req.body?.body ?? "";
    const action: unknown = req.body?.action;
    if (typeof body !== "string") return res.status(400).json({ error: "body must be a string" });
    if (action !== undefined && !isTaskTurnAction(action)) return res.status(400).json({ error: "Unknown action" });
    try {
      const asked = await deps.steering.interrupt(req.params.id, req.authContext!.user.id, { message: body, action });
      res.status(201).json({
        success: true,
        turn: { sessionId: asked.session.id, turnId: asked.currentTurn.id, jobId: asked.job.id, status: asked.job.status },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/agent/pause", validateUuidParam("id"), async (req, res, next) => {
    try {
      await deps.steering.pause(req.params.id, req.authContext!.user.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  // What resuming, or handing the work back, would carry on: one agent, and the step it would ask for again.
  router.get("/:id/agent/resume-target", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.steering.resumeTarget(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/agent/resume", validateUuidParam("id"), async (req, res, next) => {
    try {
      await deps.steering.resume(req.params.id, req.authContext!.user.id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });

  router.get("/:id/branch", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await deps.branches.describe(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/agent/take-over", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.status(201).json({ success: true, data: await deps.takeover.takeOver(req.params.id, req.authContext!.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/agent/hand-back", validateUuidParam("id"), async (req, res, next) => {
    const note: unknown = req.body?.note ?? "";
    if (typeof note !== "string") return res.status(400).json({ error: "note must be a string" });
    try {
      await deps.takeover.handBack(req.params.id, req.authContext!.user.id, note);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  });
}
