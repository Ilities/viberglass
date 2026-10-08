import type { Router } from "express";
import logger from "../../../config/logger";
import type { BuildPullRequestService } from "../../../services/pull-request-reviews/BuildPullRequestService";
import { isTaskPlanPartMark } from "@viberglass/types";
import type { TaskPartMarksService } from "../../../services/tasks/TaskPartMarksService";
import type { TaskPartsService } from "../../../services/tasks/TaskPartsService";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { validateUuidParam } from "../../middleware/validation";

interface TicketExecutionRouteDependencies {
  ticketDAO: Pick<TicketDAO, "getTicket">;
  buildPullRequestService: Pick<BuildPullRequestService, "listForTask">;
  parts: Pick<TaskPartsService, "state">;
  marks: Pick<TaskPartMarksService, "mark" | "unmark" | "discardBuild">;
}

export function registerTicketExecutionRoutes(
  router: Router,
  {
    ticketDAO,
    buildPullRequestService,
    parts,
    marks,
  }: TicketExecutionRouteDependencies,
): void {
  // GET /api/tasks/:id/build/pull-requests - The task's pull requests and their open review comments
  router.get("/:id/build/pull-requests", validateUuidParam("id"), async (req, res) => {
    try {
      const ticket = await ticketDAO.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      return res.json({ success: true, data: await buildPullRequestService.listForTask(ticket) });
    } catch (err) {
      logger.error("Error reading the build pull requests", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Failed to read the pull requests" });
    }
  });

  // GET /api/tasks/:id/build/parts - The plan part by part, and what can be built next
  router.get("/:id/build/parts", validateUuidParam("id"), async (req, res) => {
    try {
      const ticket = await ticketDAO.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      // Read afresh, so a pull request merged a moment ago lets the next part be built.
      return res.json({ success: true, data: await parts.state(ticket, { fresh: true }) });
    } catch (err) {
      logger.error("Error reading the plan's parts", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Failed to read the plan's parts" });
    }
  });

  // PUT /api/tasks/:id/build/parts/:number/mark - Marks a part done or skipped, without its pull request merging
  router.put("/:id/build/parts/:number/mark", validateUuidParam("id"), async (req, res, next) => {
    const part = Number(req.params.number);
    const mark: unknown = req.body?.mark;
    if (!Number.isInteger(part) || part < 1) return res.status(400).json({ error: "The part is its number in the plan" });
    if (!isTaskPlanPartMark(mark)) return res.status(400).json({ error: "mark is done or skipped" });
    try {
      await marks.mark(req.params.id, req.authContext!.user.id, part, mark);
      return res.json({ success: true, data: await parts.state({ id: req.params.id }) });
    } catch (error) {
      next(error);
    }
  });

  // DELETE /api/tasks/:id/build/parts/:number/mark - Takes a part's mark back
  router.delete("/:id/build/parts/:number/mark", validateUuidParam("id"), async (req, res, next) => {
    const part = Number(req.params.number);
    if (!Number.isInteger(part) || part < 1) return res.status(400).json({ error: "The part is its number in the plan" });
    try {
      await marks.unmark(req.params.id, req.authContext!.user.id, part);
      return res.json({ success: true, data: await parts.state({ id: req.params.id }) });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/tasks/:id/build/discard - Discards the open build that never opened its pull request
  router.post("/:id/build/discard", validateUuidParam("id"), async (req, res, next) => {
    try {
      await marks.discardBuild(req.params.id, req.authContext!.user.id);
      return res.json({ success: true, data: await parts.state({ id: req.params.id }) });
    } catch (error) {
      next(error);
    }
  });
}
