import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import {
  ticketReviewSchema,
  ticketReviewApproveSchema,
  ticketReviewRevokeSchema,
  ticketReviewCommentSchema,
} from "./schemas";

export class ReviewToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "ticket_review",
      "Get the full review state for a ticket across all workflow phases (research, planning, execution). Includes phase documents, approval status, and inline comments.",
      ticketReviewSchema,
      async (params) => {
        const state = await services.review.getState(params.ticketId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(state, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      "ticket_review_approve",
      "Approve the planning document for a ticket. This advances the workflow to the execution phase.",
      ticketReviewApproveSchema,
      async (params) => {
        const result = await services.review.approve(params.ticketId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      "ticket_review_revoke",
      "Revoke the planning approval for a ticket. This returns the approval state to draft.",
      ticketReviewRevokeSchema,
      async (params) => {
        const result = await services.review.revokeApproval(params.ticketId);

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      "ticket_review_comment",
      "Add an inline comment to a research or planning phase document. Comments can be used to request revisions.",
      ticketReviewCommentSchema,
      async (params) => {
        const comment = await services.review.addComment(
          params.ticketId,
          params.phase,
          {
            lineNumber: params.lineNumber,
            content: params.content,
          },
        );

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(comment, null, 2),
            },
          ],
        };
      },
    );
  }
}
