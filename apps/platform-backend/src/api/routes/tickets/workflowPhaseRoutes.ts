import type { Router } from "express";
import {
  TICKET_WORKFLOW_PHASE,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import logger from "../../../config/logger";
import type { TicketPhaseDocumentCommentService } from "../../../services/TicketPhaseDocumentCommentService";
import type { TicketPhaseDocumentRevisionService } from "../../../services/TicketPhaseDocumentRevisionService";
import type { TicketPhaseDocumentService } from "../../../services/TicketPhaseDocumentService";
import type { TicketPlanningApprovalService } from "../../../services/TicketPlanningApprovalService";
import type { TicketPlanningService } from "../../../services/TicketPlanningService";
import type { TicketResearchService } from "../../../services/TicketResearchService";
import type { TicketWorkflowService } from "../../../services/TicketWorkflowService";
import { TICKET_SERVICE_ERROR_CODE } from "../../../services/errors/TicketServiceError";
import {
  validateRunTicket,
  validateUuidParam,
} from "../../middleware/validation";
import { resolveTicketRouteServiceError } from "./routeErrors";

interface TicketWorkflowPhaseRouteDependencies {
  ticketWorkflowService: TicketWorkflowService;
  ticketPhaseDocumentService: TicketPhaseDocumentService;
  ticketPhaseDocumentRevisionService: TicketPhaseDocumentRevisionService;
  ticketPhaseDocumentCommentService: TicketPhaseDocumentCommentService;
  ticketResearchService: TicketResearchService;
  ticketPlanningService: TicketPlanningService;
  ticketPlanningApprovalService: TicketPlanningApprovalService;
}

function parseWorkflowPhaseParam(rawPhase: string): TicketWorkflowPhase | null {
  if (
    rawPhase === TICKET_WORKFLOW_PHASE.RESEARCH ||
    rawPhase === TICKET_WORKFLOW_PHASE.PLANNING ||
    rawPhase === TICKET_WORKFLOW_PHASE.EXECUTION
  ) {
    return rawPhase;
  }

  return null;
}

function parseCommentableWorkflowPhaseParam(
  rawPhase: string,
): "research" | "planning" | null {
  if (rawPhase === TICKET_WORKFLOW_PHASE.RESEARCH) {
    return TICKET_WORKFLOW_PHASE.RESEARCH;
  }
  if (rawPhase === TICKET_WORKFLOW_PHASE.PLANNING) {
    return TICKET_WORKFLOW_PHASE.PLANNING;
  }

  return null;
}

export function registerTicketWorkflowPhaseRoutes(
  router: Router,
  {
    ticketWorkflowService,
    ticketPhaseDocumentService,
    ticketPhaseDocumentRevisionService,
    ticketPhaseDocumentCommentService,
    ticketResearchService,
    ticketPlanningService,
    ticketPlanningApprovalService,
  }: TicketWorkflowPhaseRouteDependencies,
): void {
  // GET /api/tickets/:id/phases - Get workflow phase state for a ticket
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

  // POST /api/tickets/:id/phases/:phase/advance - Advance workflow phase
  router.post(
    "/:id/phases/:phase/advance",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const targetPhase = parseWorkflowPhaseParam(req.params.phase);
        if (!targetPhase) {
          return res.status(400).json({
            error: "Invalid workflow phase",
          });
        }

        const result = await ticketWorkflowService.advancePhase(
          req.params.id,
          targetPhase,
        );

        return res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";

        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        if (message.startsWith("Cannot advance ticket workflow")) {
          return res.status(409).json({
            error: message,
          });
        }

        logger.error("Error advancing ticket workflow", {
          ticketId: req.params.id,
          targetPhase: req.params.phase,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to advance ticket workflow",
        });
      }
    },
  );

  // PUT /api/tickets/:id/workflow/phase - Manually set workflow phase
  router.put("/:id/workflow/phase", validateUuidParam("id"), async (req, res) => {
    try {
      const targetPhase = parseWorkflowPhaseParam(req.body?.workflowPhase);
      if (!targetPhase) {
        return res.status(400).json({
          error: "Invalid workflow phase",
        });
      }

      const ticket = await ticketWorkflowService.setPhase(
        req.params.id,
        targetPhase,
      );

      return res.json({
        success: true,
        data: ticket,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (message === "Ticket not found") {
        return res.status(404).json({
          error: "Ticket not found",
        });
      }

      logger.error("Error setting ticket workflow phase", {
        ticketId: req.params.id,
        workflowPhase: req.body?.workflowPhase,
        error: message,
      });
      return res.status(500).json({
        error: "Internal server error",
        message: "Failed to update ticket workflow phase",
      });
    }
  });

  // GET /api/tickets/:id/phases/research - Get research phase document
  router.get(
    "/:id/phases/research",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const phase = await ticketResearchService.getResearchPhase(req.params.id);

        res.json({
          success: true,
          data: phase,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error fetching research document", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to fetch research document",
        });
      }
    },
  );

  // GET /api/tickets/:id/phases/:phase/revisions - Get revision history for a phase document
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
        const revisions = await ticketPhaseDocumentRevisionService.listRevisions(
          req.params.id,
          phase,
        );

        return res.json({
          success: true,
          data: revisions,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
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

  // GET /api/tickets/:id/phases/:phase/comments - Get inline comments for a phase document
  router.get(
    "/:id/phases/:phase/comments",
    validateUuidParam("id"),
    async (req, res) => {
      const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
      if (!phase) {
        return res.status(400).json({
          error: "Comments are only supported for research and planning phases",
        });
      }

      try {
        const comments = await ticketPhaseDocumentCommentService.listComments(
          req.params.id,
          phase,
        );

        return res.json({
          success: true,
          data: comments,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error fetching phase document comments", {
          ticketId: req.params.id,
          phase,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to fetch phase document comments",
        });
      }
    },
  );

  // POST /api/tickets/:id/phases/:phase/comments - Create an inline comment for a phase document
  router.post(
    "/:id/phases/:phase/comments",
    validateUuidParam("id"),
    async (req, res) => {
      const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
      if (!phase) {
        return res.status(400).json({
          error: "Comments are only supported for research and planning phases",
        });
      }

      const { lineNumber, content } = req.body;
      if (!Number.isInteger(lineNumber) || typeof content !== "string") {
        return res.status(400).json({
          error: "Validation error",
          message: "lineNumber must be an integer and content must be a string",
        });
      }

      try {
        const comment = await ticketPhaseDocumentCommentService.createComment(
          req.params.id,
          phase,
          {
            lineNumber,
            content,
            actor: req.auth?.user.email,
          },
        );

        return res.status(201).json({
          success: true,
          data: comment,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        if (
          message === "Comment content is required" ||
          message === "Cannot comment on an empty document" ||
          message === "Line anchor is out of range"
        ) {
          return res.status(400).json({
            error: message,
          });
        }

        logger.error("Error creating phase document comment", {
          ticketId: req.params.id,
          phase,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to create phase document comment",
        });
      }
    },
  );

  // PUT /api/tickets/:id/phases/:phase/comments/:commentId - Update an inline comment
  router.put(
    "/:id/phases/:phase/comments/:commentId",
    validateUuidParam("id"),
    validateUuidParam("commentId"),
    async (req, res) => {
      const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
      if (!phase) {
        return res.status(400).json({
          error: "Comments are only supported for research and planning phases",
        });
      }

      const { content, status } = req.body;
      const statusIsValid =
        status === undefined || status === "open" || status === "resolved";
      if (
        (content !== undefined && typeof content !== "string") ||
        !statusIsValid
      ) {
        return res.status(400).json({
          error: "Validation error",
          message:
            "content must be a string and status must be open or resolved",
        });
      }

      try {
        const comment = await ticketPhaseDocumentCommentService.updateComment(
          req.params.id,
          phase,
          req.params.commentId,
          {
            content,
            status,
            actor: req.auth?.user.email,
          },
        );

        return res.json({
          success: true,
          data: comment,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Comment not found" || message === "Ticket not found") {
          return res.status(404).json({
            error: message,
          });
        }

        if (
          message === "Comment content is required" ||
          message === "At least one comment field must be provided"
        ) {
          return res.status(400).json({
            error: message,
          });
        }

        logger.error("Error updating phase document comment", {
          ticketId: req.params.id,
          phase,
          commentId: req.params.commentId,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to update phase document comment",
        });
      }
    },
  );

  // POST /api/tickets/:id/phases/research/run - Run research generation
  router.post(
    "/:id/phases/research/run",
    validateUuidParam("id"),
    validateRunTicket,
    async (req, res) => {
      try {
        const result = await ticketResearchService.runResearch(
          req.params.id,
          req.body,
        );

        return res.status(202).json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Error running research", {
          ticketId: req.params.id,
          error: message,
        });

        const serviceError = resolveTicketRouteServiceError(error);
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

  // PUT /api/tickets/:id/phases/research/document - Save research phase document
  router.put(
    "/:id/phases/research/document",
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
          TICKET_WORKFLOW_PHASE.RESEARCH,
          content,
          { actor: req.auth?.user.email },
        );

        res.json({
          success: true,
          data: document,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error saving research document", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to save research document",
        });
      }
    },
  );

  // GET /api/tickets/:id/phases/planning - Get planning phase document
  router.get(
    "/:id/phases/planning",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const phase = await ticketPlanningService.getPlanningPhase(req.params.id);

        res.json({
          success: true,
          data: phase,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
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

  // POST /api/tickets/:id/phases/planning/request-approval - Request approval for planning
  router.post(
    "/:id/phases/planning/request-approval",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const actor = req.auth?.user.email;
        const result = await ticketPlanningApprovalService.requestApproval(
          req.params.id,
          actor,
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const serviceError = resolveTicketRouteServiceError(error);
        if (
          serviceError?.serviceError.code ===
          TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND
        ) {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error requesting planning approval", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to request planning approval",
        });
      }
    },
  );

  // POST /api/tickets/:id/phases/planning/approve - Approve planning document
  router.post(
    "/:id/phases/planning/approve",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const actor = req.auth?.user.email;
        const result = await ticketPlanningApprovalService.approve(
          req.params.id,
          actor,
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        const serviceError = resolveTicketRouteServiceError(error);
        if (
          serviceError?.serviceError.code ===
          TICKET_SERVICE_ERROR_CODE.TICKET_NOT_FOUND
        ) {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error approving planning document", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to approve planning document",
        });
      }
    },
  );

  // POST /api/tickets/:id/phases/planning/revoke-approval - Revoke planning approval
  router.post(
    "/:id/phases/planning/revoke-approval",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const actor = req.auth?.user.email;
        const result = await ticketPlanningApprovalService.revokeApproval(
          req.params.id,
          actor,
        );

        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        if (message === "Ticket not found") {
          return res.status(404).json({
            error: "Ticket not found",
          });
        }

        logger.error("Error revoking planning approval", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to revoke planning approval",
        });
      }
    },
  );

  // PUT /api/tickets/:id/phases/planning/document - Save planning phase document
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
          { actor: req.auth?.user.email },
        );

        res.json({
          success: true,
          data: document,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
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

  // POST /api/tickets/:id/phases/planning/run - Run planning generation
  router.post(
    "/:id/phases/planning/run",
    validateUuidParam("id"),
    validateRunTicket,
    async (req, res) => {
      try {
        const result = await ticketPlanningService.runPlanning(
          req.params.id,
          req.body,
        );

        return res.status(202).json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        logger.error("Error running planning", {
          ticketId: req.params.id,
          error: message,
        });

        const serviceError = resolveTicketRouteServiceError(error);
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
