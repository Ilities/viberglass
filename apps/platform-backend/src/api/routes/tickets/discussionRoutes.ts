import type { Router } from "express";
import { isTaskTurnAction, mentionsAnAgent } from "@viberglass/types";
import type { TaskDiscussionService } from "../../../services/tasks/TaskDiscussionService";
import type { TaskTimelineService } from "../../../services/tasks/TaskTimelineService";
import type { TaskTurnService } from "../../../services/taskTurns/TaskTurnService";
import type { TaskMentionDAO } from "../../../persistence/ticketing/TaskMentionDAO";
import { validateUuidParam } from "../../middleware/validation";

/**
 * A task's thread, posting to it, and being done with a mention. A message that mentions an agent, or
 * asks for an action, starts the agent's turn; who may ask for what is
 * TaskTurnService's to check. Registered on the tasks router, so its `:id`
 * guard applies; viewers are refused posting by the global guard.
 */
export function registerTaskDiscussionRoutes(
  router: Router,
  deps: {
    discussion: Pick<TaskDiscussionService, "post" | "list">;
    timeline: Pick<TaskTimelineService, "list">;
    turns: Pick<TaskTurnService, "ask">;
    mentions: Pick<TaskMentionDAO, "markDone">;
  },
): void {
  // Done with being mentioned without replying: it stops being their move.
  router.post("/:id/mentions/done", validateUuidParam("id"), async (req, res, next) => {
    try {
      res.json({ success: true, data: { done: await deps.mentions.markDone(req.params.id, req.authContext!.user.id) } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/:id/messages", validateUuidParam("id"), async (req, res, next) => {
    const body: unknown = req.body?.body ?? "";
    const action: unknown = req.body?.action;
    const agentId: unknown = req.body?.agentId;
    if (typeof body !== "string") return res.status(400).json({ error: "body must be a string" });
    if (action !== undefined && !isTaskTurnAction(action)) return res.status(400).json({ error: "Unknown action" });
    if (agentId !== undefined && typeof agentId !== "string") return res.status(400).json({ error: "agentId must be a string" });
    try {
      const userId = req.authContext!.user.id;
      if (!action && !agentId && !mentionsAnAgent(body)) {
        return res.status(201).json({ success: true, data: await deps.discussion.post(req.params.id, userId, body) });
      }
      const asked = await deps.turns.ask(req.params.id, userId, { message: body, action, agentId });
      res.status(201).json({
        success: true,
        data: await deps.discussion.list(req.params.id),
        turn: { sessionId: asked.session.id, turnId: asked.currentTurn.id, jobId: asked.job.id, status: asked.job.status },
      });
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
