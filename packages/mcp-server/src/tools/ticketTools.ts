import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import {
  ticketListSchema,
  ticketCreateSchema,
  ticketGetSchema,
  ticketTriggerSchema,
} from "./schemas";

export class TicketToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "ticket_list",
      "List tickets with optional filters. Returns tickets with their status, phase, and metadata.",
      ticketListSchema,
      async (params) => {
        const statuses = params.statuses
          ? params.statuses.split(",").map((s) => s.trim())
          : undefined;
        const workflowPhases = params.workflowPhases
          ? params.workflowPhases.split(",").map((p) => p.trim())
          : undefined;

        const result = await services.tickets.list({
          ...params,
          statuses,
          workflowPhases,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  tickets: result.tickets,
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
      "ticket_create",
      "Create a new ticket in a project. Returns the created ticket with its ID and workflow state.",
      ticketCreateSchema,
      async (params) => {
        const ticket = await services.tickets.create({
          projectId: params.projectId,
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
      "ticket_get",
      "Get detailed information about a specific ticket including its current workflow phase and status.",
      ticketGetSchema,
      async (params) => {
        const ticket = await services.tickets.get(params.ticketId);
        if (!ticket) {
          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ error: "Ticket not found" }),
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
      "ticket_trigger",
      "Trigger a workflow phase run for a ticket (research, planning, or execution). Returns the job ID for tracking.",
      ticketTriggerSchema,
      async (params) => {
        const result = await services.tickets.trigger(params.ticketId, {
          clankerId: params.clankerId,
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
