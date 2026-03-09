import type { Router } from "express";
import logger from "../../../config/logger";
import type { TicketExecutionService } from "../../../services/TicketExecutionService";
import type { TicketWorkflowOverrideService } from "../../../services/TicketWorkflowOverrideService";
import { validateRunTicket, validateUuidParam } from "../../middleware/validation";
import { resolveTicketRouteServiceError } from "./routeErrors";

interface TicketExecutionRouteDependencies {
  ticketExecutionService: TicketExecutionService;
  ticketWorkflowOverrideService: TicketWorkflowOverrideService;
}

export function registerTicketExecutionRoutes(
  router: Router,
  { ticketExecutionService, ticketWorkflowOverrideService }: TicketExecutionRouteDependencies,
): void {
  // POST /api/tickets/:id/run - Run a ticket as a job with worker invocation
  router.post(
    "/:id/run",
    validateUuidParam("id"),
    validateRunTicket,
    async (req, res) => {
      try {
        const ticketId = req.params.id;
        const result = await ticketExecutionService.runTicket(ticketId, req.body);

        return res.status(202).json({
          success: true,
          data: result,
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Error running ticket", {
          error: error.message,
        });

        const serviceError = resolveTicketRouteServiceError(err);
        if (serviceError) {
          return res.status(serviceError.statusCode).json(serviceError.body);
        }

        return res.status(500).json({
          error: "Internal server error",
          message: error.message || "Failed to run ticket",
        });
      }
    },
  );

  // POST /api/tickets/:id/workflow/override-to-execution - Explicitly bypass research/planning gate
  router.post(
    "/:id/workflow/override-to-execution",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const reason =
          typeof req.body?.reason === "string" ? req.body.reason : "";
        const actor = req.auth?.user.email;
        const ticket = await ticketWorkflowOverrideService.overrideToExecution(
          req.params.id,
          reason,
          actor,
        );

        return res.json({
          success: true,
          data: ticket,
        });
      } catch (err) {
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
