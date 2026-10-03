import type { AcpMcpServer } from "./types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * The MCP servers a harness can take, by what its `initialize` reply says:
 * every harness runs stdio servers, HTTP ones only when it advertises them.
 */
export function mcpServersSupportedBy(
  initializeResult: unknown,
  servers: AcpMcpServer[],
): { offered: AcpMcpServer[]; leftOut: string[] } {
  const capabilities = isRecord(initializeResult) && isRecord(initializeResult.agentCapabilities) ? initializeResult.agentCapabilities : {};
  const mcp = isRecord(capabilities.mcpCapabilities) ? capabilities.mcpCapabilities : {};
  const http = mcp.http === true;
  const offered = servers.filter((server) => !("type" in server) || http);
  const leftOut = servers.filter((server) => !offered.includes(server)).map((server) => server.name);
  return { offered, leftOut };
}

/** One plain sentence for people following the run, naming the servers the agent went without. */
export function describeLeftOutMcpServers(names: string[]): string {
  return `This agent can't connect to MCP servers over HTTP, so it runs without: ${names.join(", ")}`;
}
