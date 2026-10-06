import type { Router } from "express";
import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from "@viberglass/types";
import logger from "../../../config/logger";
import type { TicketPhaseDocumentRevisionService } from "../../../services/TicketPhaseDocumentRevisionService";
import type { TicketPhaseDocumentService } from "../../../services/TicketPhaseDocumentService";
import type { TicketPlanningService } from "../../../services/TicketPlanningService";
import type { TicketWorkflowService } from "../../../services/TicketWorkflowService";
import { validateUuidParam } from "../../middleware/validation";

interface TicketWorkflowPhaseRouteDependencies {
  ticketWorkflowService: TicketWorkflowService;
  ticketPhaseDocumentService: TicketPhaseDocumentService;
  ticketPhaseDocumentRevisionService: TicketPhaseDocumentRevisionService;
  ticketPlanningService: TicketPlanningService;
}

function parseWorkflowPhaseParam(rawPhase: string): TicketWorkflowPhase | null {
  if (
    rawPhase === TICKET_WORKFLOW_PHASE.PLANNING ||
    rawPhase === TICKET_WORKFLOW_PHASE.EXECUTION
  ) {
    return rawPhase;
  }

  return null;
}

export function registerTicketWorkflowPhaseRoutes(
  router: Router,
  {
    ticketWorkflowService,
    ticketPhaseDocumentService,
    ticketPhaseDocumentRevisionService,
    ticketPlanningService,
  }: TicketWorkflowPhaseRouteDependencies,
): void {
  // GET /api/tasks/:id/phases - Get workflow phase state for a ticket
  router.get("/:id/phases", validateUuidParam("id"), async (req, res) => {
    try {
      const workflow = await ticketWorkflowService.getTicketWorkflow(
        req.params.id,
      );

      res.json({
        success: true,
        data: workflow,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error fetching ticket workflow", {
        ticketId: req.params.id,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to fetch ticket workflow",
      });
    }
  });

  // GET /api/tasks/:id/phases/:phase/revisions - Get revision history for a phase document
  router.get(
    "/:id/phases/:phase/revisions",
    validateUuidParam("id"),
    async (req, res) => {
      const phase = parseWorkflowPhaseParam(req.params.phase);
      if (!phase) {
        return res.status(400).json({
          error: "Invalid workflow phase",
        });
      }

      try {
        const revisions =
          await ticketPhaseDocumentRevisionService.listRevisions(
            req.params.id,
            phase,
          );

        return res.json({
          success: true,
          data: revisions,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error fetching phase document revisions", {
          ticketId: req.params.id,
          phase,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to fetch phase document revisions",
        });
      }
    },
  );

  // GET /api/tasks/:id/phases/planning - Get planning phase document
  router.get(
    "/:id/phases/planning",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const phase = await ticketPlanningService.getPlanningPhase(
          req.params.id,
        );

        res.json({
          success: true,
          data: phase,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error fetching planning document", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to fetch planning document",
        });
      }
    },
  );

  // PUT /api/tasks/:id/phases/planning/document - Save planning phase document
  router.put(
    "/:id/phases/planning/document",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const { content } = req.body;
        if (typeof content !== "string") {
          return res.status(400).json({
            error: "Validation error",
            message: "content must be a string",
          });
        }

        const document = await ticketPhaseDocumentService.saveDocument(
          req.params.id,
          TICKET_WORKFLOW_PHASE.PLANNING,
          content,
          { actor: req.authContext?.user.email },
        );

        res.json({
          success: true,
          data: document,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error saving planning document", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to save planning document",
        });
      }
    },
  );
}
