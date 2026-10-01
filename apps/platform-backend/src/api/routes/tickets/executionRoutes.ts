import type { Router } from "express";
import logger from "../../../config/logger";
import type { BuildPullRequestService } from "../../../services/pull-request-reviews/BuildPullRequestService";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { validateUuidParam } from "../../middleware/validation";

interface TicketExecutionRouteDependencies {
  ticketDAO: Pick<TicketDAO, "getTicket">;
  buildPullRequestService: Pick<BuildPullRequestService, "forTask">;
}

export function registerTicketExecutionRoutes(
  router: Router,
  {
    ticketDAO,
    buildPullRequestService,
  }: TicketExecutionRouteDependencies,
): void {
  // GET /api/tasks/:id/build/pull-request - The pull request and its open review comments
  router.get("/:id/build/pull-request", validateUuidParam("id"), async (req, res) => {
    try {
      const ticket = await ticketDAO.getTicket(req.params.id);
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found" });
      }
      return res.json({ success: true, data: await buildPullRequestService.forTask(ticket) });
    } catch (err) {
      logger.error("Error reading the build pull request", {
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Failed to read the pull request" });
    }
  });
}
