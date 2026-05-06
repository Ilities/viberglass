import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import { projectListSchema } from "./schemas";

export class ProjectToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "project_list",
      "List available projects. Returns projects with their id, name, slug, and ticketing info. Use this to discover project UUIDs needed for ticket_create and ticket_list.",
      projectListSchema,
      async (params) => {
        const result = await services.projects.list({
          limit: params.limit,
          offset: params.offset,
        });

        const summaries = result.projects.map((p) => ({
          id: p.id,
          name: p.name,
          slug: p.slug,
          primaryTicketingIntegrationId: p.primaryTicketingIntegrationId,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { projects: summaries, total: result.total },
                null,
                2,
              ),
            },
          ],
        };
      },
    );
  }
}
