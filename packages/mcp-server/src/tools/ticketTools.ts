import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import {
  ticketListSchema,
  ticketCreateSchema,
  ticketGetSchema,
  ticketTriggerSchema,
  ticketBranchSchema,
} from "./schemas";

export class TicketToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "task_list",
      "List tasks with optional filters. Returns tasks with their status, phase, and metadata.",
      ticketListSchema,
      async (params) => {
        const statuses = params.statuses
          ? params.statuses.split(",").map((s) => s.trim())
          : undefined;
        const workflowPhases = params.workflowPhases
          ? params.workflowPhases.split(",").map((p) => p.trim())
          : undefined;

        const { spaceId, ...filters } = params;
        const result = await services.tickets.list({
          ...filters,
          projectId: spaceId,
          statuses,
          workflowPhases,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  tasks: result.tickets,
                  total: result.total,
                },
                null,
                2,
              ),
            },
          ],
        };
      },
    );

    server.tool(
      "task_create",
      "Create a new task in a space. Returns the created task with its ID and workflow state.",
      ticketCreateSchema,
      async (params) => {
        const ticket = await services.tickets.create({
          projectId: params.spaceId,
          title: params.title,
          description: params.description,
          severity: params.severity,
          category: params.category,
          ticketSystem: params.ticketSystem,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(ticket, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      "task_get",
      "Get detailed information about a specific task including its current workflow phase and status.",
      ticketGetSchema,
      async (params) => {
        const ticket = await services.tickets.get(params.taskId);
        if (!ticket) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Task not found" }),
              },
            ],
            isError: true,
          };
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(ticket, null, 2),
            },
          ],
        };
      },
    );

    server.tool(
      "task_branch",
      "Get the git branch a task's code is on, its repository and base branch, and who has taken the work over. `viberglass checkout` uses it.",
      ticketBranchSchema,
      async (params) => {
        const branch = await services.tickets.branch(params.task);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(branch ?? { error: "No such task, or its space has no repository" }) }],
          ...(branch ? {} : { isError: true }),
        };
      },
    );

    server.tool(
      "task_trigger",
      "Start a workflow phase run for a task (research, planning, or execution). Returns the run ID for tracking.",
      ticketTriggerSchema,
      async (params) => {
        const result = await services.tickets.trigger(params.taskId, {
          clankerId: params.agentId,
          targetPhase: params.targetPhase,
        });

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
  }
}
