import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices } from "./types";
import { ToolRegistry } from "./tools/registry";
import { ClankerToolGroup } from "./tools/clankerTools";
import { ProjectToolGroup } from "./tools/projectTools";
import { TicketToolGroup } from "./tools/ticketTools";
import { ReviewToolGroup } from "./tools/reviewTools";

export interface McpServerOptions {
  name?: string;
  version?: string;
}

export function createMcpServer(
  services: McpToolServices,
  options?: McpServerOptions,
): McpServer {
  const server = new McpServer({
    name: options?.name ?? "viberglass",
    version: options?.version ?? "1.0.0",
  });

  const registry = new ToolRegistry();
  registry.addGroup(new ClankerToolGroup());
  registry.addGroup(new ProjectToolGroup());
  registry.addGroup(new TicketToolGroup());
  registry.addGroup(new ReviewToolGroup());
  registry.applyAll(server, services);

  return server;
}
