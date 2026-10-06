import type { Router } from "express";
import { TICKET_WORKFLOW_PHASE, type TextQuote } from "@viberglass/types";
import logger from "../../../config/logger";
import type { TicketPhaseDocumentCommentService } from "../../../services/TicketPhaseDocumentCommentService";
import { validateUuidParam } from "../../middleware/validation";

/** A comment's quote from the request: undefined when absent, null when malformed. */
function parseTextQuote(raw: unknown): TextQuote | null | undefined {
  if (raw === undefined) return undefined;
  if (typeof raw !== "object" || raw === null || !("exact" in raw) || !("prefix" in raw) || !("suffix" in raw)) return null;
  const { exact, prefix, suffix } = raw;
  if (typeof exact !== "string" || typeof prefix !== "string" || typeof suffix !== "string") return null;
  return { exact, prefix, suffix };
}

function parseCommentableWorkflowPhaseParam(
  rawPhase: string,
): "planning" | null {
  return rawPhase === TICKET_WORKFLOW_PHASE.PLANNING ? TICKET_WORKFLOW_PHASE.PLANNING : null;
}

/** Comments anchored to the text of a task's plan. */
export function registerDocumentCommentRoutes(
  router: Router,
  { ticketPhaseDocumentCommentService }: { ticketPhaseDocumentCommentService: TicketPhaseDocumentCommentService },
): void {
  // GET /api/tasks/:id/phases/:phase/comments - Get inline comments for a phase document
  router.get(
    "/:id/phases/:phase/comments",
    validateUuidParam("id"),
    async (req, res) => {
      const phase = parseCommentableWorkflowPhaseParam(req.params.phase);
      if (!phase) {
        return res.status(400).json({
          error: "Comments are only supported on the plan",
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
          error: "Comments are only supported on the plan",
        });
      }

      const { lineNumber, content } = req.body;
      const quote = parseTextQuote(req.body.quote);
      if (
        typeof content !== "string" ||
        (quote === undefined && !Number.isInteger(lineNumber)) ||
        quote === null
      ) {
        return res.status(400).json({
          error: "Validation error",
          message:
            "content must be a string, with a quote ({ exact, prefix, suffix }) or an integer lineNumber",
        });
      }

      try {
        const comment = await ticketPhaseDocumentCommentService.createComment(
          req.params.id,
          phase,
          {
            quote,
            lineNumber: Number.isInteger(lineNumber) ? lineNumber : undefined,
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
          message === "Line anchor is out of range" ||
          message === "The quoted text isn't in the document" ||
          message === "Pick some text to comment on"
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
          error: "Comments are only supported on the plan",
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
}
