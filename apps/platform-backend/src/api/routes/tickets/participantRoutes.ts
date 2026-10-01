import type { Router } from "express";
import { isTaskParticipantRole, RUNNER_ROLES } from "@viberglass/types";
import type { TaskParticipantService } from "../../../services/tasks/TaskParticipantService";
import { requireRunnerRole } from "../../middleware/workspaceRoleGuards";
import { validateUuidParam } from "../../middleware/validation";

/**
 * People on a task. Registered on the tasks router, so its `:id` guard hides
 * tasks in spaces the caller can't see. Anyone may watch or unwatch for
 * themselves; changing anyone else needs an admin or member.
 */
export function registerTaskParticipantRoutes(router: Router, participants: TaskParticipantService): void {
  router.get("/:id/participants", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: await participants.list(req.params.id) });
    } catch (error) {
      next(error);
    }
  });

  router.put("/:id/participants/owner", validateUuidParam("id"), requireRunnerRole, async (req, res, next) => {
    const userId: unknown = req.body?.userId;
    if (typeof userId !== "string") return res.status(400).json({ error: "userId is required" });
    try {
      res.json({ success: true, data: await participants.setOwner(req.params.id, userId, req.authContext!.user.id) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/participants", validateUuidParam("id"), async (req, res, next) => {
    const { userId, role } = req.body ?? {};
    if (typeof userId !== "string" || !isTaskParticipantRole(role)) {
      return res.status(400).json({ error: "userId and role are required" });
    }
    const actor = req.authContext!.user;
    if (!(role === "watcher" && userId === actor.id) && !RUNNER_ROLES.includes(actor.role)) {
      return res.status(403).json({ error: "Only admins and members can add other people to a task." });
    }
    try {
      res.status(201).json({ success: true, data: await participants.add(req.params.id, userId, role, actor.id) });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/:id/participants/:userId/:role", validateUuidParam("id"), validateUuidParam("userId"), async (req, res, next) => {
    const { userId, role } = req.params;
    if (!isTaskParticipantRole(role)) return res.status(400).json({ error: "Unknown role" });
    const actor = req.authContext!.user;
    if (!(role === "watcher" && userId === actor.id) && !RUNNER_ROLES.includes(actor.role)) {
      return res.status(403).json({ error: "Only admins and members can take other people off a task." });
    }
    try {
      res.json({ success: true, data: await participants.remove(req.params.id, userId, role, actor.id) });
    } catch (error) {
      next(error);
    }
  });
}
