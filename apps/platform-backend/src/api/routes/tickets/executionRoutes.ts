import type { Router } from "express";
import logger from "../../../config/logger";
import type { TicketWorkflowOverrideService } from "../../../services/TicketWorkflowOverrideService";
import type { BuildPullRequestService } from "../../../services/pull-request-reviews/BuildPullRequestService";
import type { TicketDAO } from "../../../persistence/ticketing/TicketDAO";
import { validateUuidParam } from "../../middleware/validation";
import { resolveTicketRouteServiceError } from "./routeErrors";
import { isApprovalPolicyError } from "../../../services/errors/ApprovalPolicyError";
import { requireRunnerRole } from "../../middleware/workspaceRoleGuards";

interface TicketExecutionRouteDependencies {
  ticketWorkflowOverrideService: TicketWorkflowOverrideService;
  ticketDAO: Pick<TicketDAO, "getTicket">;
  buildPullRequestService: Pick<BuildPullRequestService, "forTask">;
}

export function registerTicketExecutionRoutes(
  router: Router,
  {
    ticketWorkflowOverrideService,
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

  // POST /api/tasks/:id/workflow/override-to-execution - Explicitly bypass research/planning gate
  router.post(
    "/:id/workflow/override-to-execution",
    requireRunnerRole,
    validateUuidParam("id"),
    async (req, res, next) => {
      try {
        const reason =
          typeof req.body?.reason === "string" ? req.body.reason : "";
        const ticket = await ticketWorkflowOverrideService.overrideToExecution(
          req.params.id,
          reason,
          req.authContext?.user.id ?? null,
        );

        return res.json({
          success: true,
          data: ticket,
        });
      } catch (err) {
        if (isApprovalPolicyError(err)) return next(err);
        const error = err instanceof Error ? err : new Error(String(err));
        const message = error.message || "Failed to override workflow";

        logger.error("Error overriding ticket workflow to execution", {
          ticketId: req.params.id,
          error: message,
        });

        const serviceError = resolveTicketRouteServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message,
        });
      }
    },
  );
}
