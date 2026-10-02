export interface PlatformSessionEvent {
  eventType: string;
  payload: Record<string, unknown>;
}

/** An MCP server the harness starts for the session over stdio, as ACP's `mcpServers` describe it. */
export interface AcpMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}
