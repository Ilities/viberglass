import type { Router } from "express";
import logger from "../../../config/logger";
import type { ReopenableStep, TicketStepReopenService } from "../../../services/TicketStepReopenService";
import { validateUuidParam } from "../../middleware/validation";
import { resolveTicketRouteServiceError } from "./routeErrors";

function parseReopenableStep(value: string): ReopenableStep | null {
  return value === "research" || value === "planning" ? value : null;
}

export function registerTicketReopenRoutes(
  router: Router,
  { ticketStepReopenService }: { ticketStepReopenService: Pick<TicketStepReopenService, "reopen"> },
): void {
  // POST /api/tasks/:id/phases/:phase/reopen - Take the task back to research or the plan
  router.post("/:id/phases/:phase/reopen", validateUuidParam("id"), async (req, res) => {
    const step = parseReopenableStep(req.params.phase);
    if (!step) {
      return res.status(400).json({ error: "Only research and the plan can be reopened" });
    }

    try {
      const ticket = await ticketStepReopenService.reopen(req.params.id, step, req.authContext?.user.id ?? null);
      return res.json({ success: true, data: ticket });
    } catch (err) {
      const serviceError = resolveTicketRouteServiceError(err);
      if (serviceError) {
        return res.status(serviceError.statusCode).json(serviceError.body);
      }
      logger.error("Error reopening task step", {
        ticketId: req.params.id,
        step,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: "Failed to reopen the step" });
    }
  });
}
