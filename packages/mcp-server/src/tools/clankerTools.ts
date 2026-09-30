import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import { clankerListSchema } from "./schemas";

export class ClankerToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "agent_list",
      "List available agents. Returns agents with their id, name, slug, harness, and status. Use this to discover agent UUIDs needed for task_trigger.",
      clankerListSchema,
      async (params) => {
        const result = await services.clankers.list({
          status: params.status,
          limit: params.limit,
          offset: params.offset,
        });

        const summaries = result.clankers.map((c) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          description: c.description,
          agent: c.agent,
          status: c.status,
        }));

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                { agents: summaries, total: result.total },
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
