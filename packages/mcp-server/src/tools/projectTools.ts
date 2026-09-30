import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import { projectListSchema } from "./schemas";

export class ProjectToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "space_list",
      "List available spaces. Returns spaces with their id, name, slug, and tracker info. Use this to discover space UUIDs needed for task_create and task_list.",
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
                { spaces: summaries, total: result.total },
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
