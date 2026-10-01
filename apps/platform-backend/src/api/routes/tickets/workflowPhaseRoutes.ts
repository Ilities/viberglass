import type { Router } from "express";
import {
  TICKET_WORKFLOW_PHASE,
  type TicketWorkflowPhase,
} from "@viberglass/types";
import logger from "../../../config/logger";
import type { TicketPhaseDocumentCommentService } from "../../../services/TicketPhaseDocumentCommentService";
import type { TicketPhaseDocumentRevisionService } from "../../../services/TicketPhaseDocumentRevisionService";
import type { TicketPhaseDocumentService } from "../../../services/TicketPhaseDocumentService";
import type { TicketPlanningService } from "../../../services/TicketPlanningService";
import type { TicketResearchService } from "../../../services/TicketResearchService";
import type { TicketWorkflowService } from "../../../services/TicketWorkflowService";
import {
  validateRunTicket,
  validateUuidParam,
} from "../../middleware/validation";
import { resolveTicketRouteServiceError } from "./routeErrors";
import { requireRunnerRole } from "../../middleware/workspaceRoleGuards";

interface TicketWorkflowPhaseRouteDependencies {
  ticketWorkflowService: TicketWorkflowService;
  ticketPhaseDocumentService: TicketPhaseDocumentService;
  ticketPhaseDocumentRevisionService: TicketPhaseDocumentRevisionService;
  ticketPhaseDocumentCommentService: TicketPhaseDocumentCommentService;
  ticketResearchService: TicketResearchService;
  ticketPlanningService: TicketPlanningService;
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

  // GET /api/tasks/:id/phases/research - Get research phase document
  router.get(
    "/:id/phases/research",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const phase = await ticketResearchService.getResearchPhase(
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

  // GET /api/tasks/:id/phases/:phase/comments - Get inline comments for a phase document
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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

  // POST /api/tasks/:id/phases/:phase/comments - Create an inline comment for a phase document
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
            actor: req.authContext?.user.email,
          },
        );

        return res.status(201).json({
          success: true,
          data: comment,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
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

  // PUT /api/tasks/:id/phases/:phase/comments/:commentId - Update an inline comment
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
            actor: req.authContext?.user.email,
          },
        );

        return res.json({
          success: true,
          data: comment,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
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

  // POST /api/tasks/:id/phases/research/run - Run research generation
  router.post(
    "/:id/phases/research/run",
    requireRunnerRole,
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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

  // POST /api/tasks/:id/phases/research/revision - Run research revision
  router.post(
    "/:id/phases/research/revision",
    requireRunnerRole,
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const { clankerId, revisionMessage } = req.body;
        if (
          typeof clankerId !== "string" ||
          typeof revisionMessage !== "string"
        ) {
          return res.status(400).json({
            error: "Validation error",
            message: "clankerId and revisionMessage must be strings",
          });
        }

        const result = await ticketResearchService.runResearchRevision(
          req.params.id,
          { clankerId, revisionMessage },
        );

        return res.status(202).json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("Error running research revision", {
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

  // PUT /api/tasks/:id/phases/research/document - Save research phase document
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

  // POST /api/tasks/:id/phases/planning/run - Run planning generation
  router.post(
    "/:id/phases/planning/run",
    requireRunnerRole,
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
        const message =
          error instanceof Error ? error.message : "Unknown error";
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

  // POST /api/tasks/:id/phases/planning/revision - Run planning revision
  router.post(
    "/:id/phases/planning/revision",
    requireRunnerRole,
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const { clankerId, revisionMessage } = req.body;
        if (
          typeof clankerId !== "string" ||
          typeof revisionMessage !== "string"
        ) {
          return res.status(400).json({
            error: "Validation error",
            message: "clankerId and revisionMessage must be strings",
          });
        }

        const result = await ticketPlanningService.runPlanningRevision(
          req.params.id,
          { clankerId, revisionMessage },
        );

        return res.status(202).json({
          success: true,
          data: result,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        logger.error("Error running planning revision", {
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
