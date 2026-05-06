import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";
import { clankerListSchema } from "./schemas";

export class ClankerToolGroup implements ToolGroup {
  register(server: McpServer, services: McpToolServices): void {
    server.tool(
      "clanker_list",
      "List available clankers (AI agents). Returns clankers with their id, name, slug, agent type, and status. Use this to discover clanker UUIDs needed for ticket_trigger.",
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
                { clankers: summaries, total: result.total },
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
