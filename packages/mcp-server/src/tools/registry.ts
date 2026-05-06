import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { McpToolServices, ToolGroup } from "../types";

export class ToolRegistry {
  private groups: ToolGroup[] = [];

  addGroup(group: ToolGroup): void {
    this.groups.push(group);
  }

  applyAll(server: McpServer, services: McpToolServices): void {
    for (const group of this.groups) {
      group.register(server, services);
    }
  }
}
