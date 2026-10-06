import type { Router } from "express";
import logger from "../../../config/logger";
import type { BuildPullRequestService } from "../../../services/pull-request-reviews/BuildPullRequestService";
import type { TaskPartsService } from "../../../services/tasks/TaskPartsService";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { validateUuidParam } from "../../middleware/validation";

interface TicketExecutionRouteDependencies {
  ticketDAO: Pick<TicketDAO, "getTicket">;
  buildPullRequestService: Pick<BuildPullRequestService, "listForTask">;
  parts: Pick<TaskPartsService, "state">;
}

export function registerTicketExecutionRoutes(
  router: Router,
  {
    ticketDAO,
    buildPullRequestService,
    parts,
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
}
