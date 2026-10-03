export interface PlatformSessionEvent {
  eventType: string;
  payload: Record<string, unknown>;
}

/** An MCP server the harness starts for the session over stdio, as ACP's `mcpServers` describe it. */
export interface AcpStdioMcpServer {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

/** A remote MCP server the harness connects to over HTTP; only for harnesses that say they can. */
export interface AcpHttpMcpServer {
  type: "http";
  name: string;
  url: string;
  headers: Array<{ name: string; value: string }>;
}

export type AcpMcpServer = AcpStdioMcpServer | AcpHttpMcpServer;
