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
      "task_review",
      "Get the full review state for a task across all workflow phases (research, planning, execution). Includes phase documents, approval status, and inline comments.",
      ticketReviewSchema,
      async (params) => {
        const state = await services.review.getState(params.taskId);

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
      "task_review_approve",
      "Approve the planning document for a task. This advances the workflow to the execution phase.",
      ticketReviewApproveSchema,
      async (params) => {
        const result = await services.review.approve(params.taskId);

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
      "task_review_revoke",
      "Revoke the planning approval for a task. This returns the approval state to draft.",
      ticketReviewRevokeSchema,
      async (params) => {
        const result = await services.review.revokeApproval(params.taskId);

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
      "task_review_comment",
      "Add an inline comment to a research or planning phase document. Comments can be used to request revisions.",
      ticketReviewCommentSchema,
      async (params) => {
        const comment = await services.review.addComment(
          params.taskId,
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
