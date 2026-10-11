import type { Router } from "express";
import type { TextQuote } from "@viberglass/types";
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

/** Comments anchored to the text of a task's plan. */
export function registerDocumentCommentRoutes(
  router: Router,
  { ticketPhaseDocumentCommentService }: { ticketPhaseDocumentCommentService: TicketPhaseDocumentCommentService },
): void {
  // GET /api/tasks/:id/plan/comments - The plan's inline comments
  router.get(
    "/:id/plan/comments",
    validateUuidParam("id"),
    async (req, res) => {
      try {
        const comments = await ticketPhaseDocumentCommentService.listComments(req.params.id);

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

        logger.error("Error fetching plan comments", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to fetch plan comments",
        });
      }
    },
  );

  // POST /api/tasks/:id/plan/comments - Comment on the plan
  router.post(
    "/:id/plan/comments",
    validateUuidParam("id"),
    async (req, res) => {
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

        logger.error("Error creating plan comment", {
          ticketId: req.params.id,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to create plan comment",
        });
      }
    },
  );

  // PUT /api/tasks/:id/plan/comments/:commentId - Update an inline comment
  router.put(
    "/:id/plan/comments/:commentId",
    validateUuidParam("id"),
    validateUuidParam("commentId"),
    async (req, res) => {
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

        if (message === "Only the comment's author can edit it") {
          return res.status(403).json({
            error: message,
          });
        }

        logger.error("Error updating plan comment", {
          ticketId: req.params.id,
          commentId: req.params.commentId,
          error: message,
        });
        return res.status(500).json({
          error: "Internal server error",
          message: "Failed to update plan comment",
        });
      }
    },
  );
}
