import { spawn } from "child_process";
import * as readline from "readline";

/** An MCP server the client offered the session, as ACP describes one. */
export interface McpServerSpec {
  name: string;
  command: string;
  args: string[];
  env: Array<{ name: string; value: string }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The stdio MCP servers in a `session/new` or `session/load`. */
export function mcpServersOf(params: Record<string, unknown>): McpServerSpec[] {
  const servers = Array.isArray(params.mcpServers) ? params.mcpServers : [];
  return servers.flatMap((server): McpServerSpec[] => {
    if (!isRecord(server) || typeof server.name !== "string" || typeof server.command !== "string") return [];
    const args = Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === "string") : [];
    const env = Array.isArray(server.env)
      ? server.env.flatMap((entry) => (isRecord(entry) && typeof entry.name === "string" && typeof entry.value === "string" ? [{ name: entry.name, value: entry.value }] : []))
      : [];
    return [{ name: server.name, command: server.command, args, env }];
  });
}

function toolText(result: unknown): string {
  const content = isRecord(result) && Array.isArray(result.content) ? result.content : [];
  return content.map((block) => (isRecord(block) && typeof block.text === "string" ? block.text : "")).join("\n");
}

/**
 * Starts an MCP server the way a harness does and calls one of its tools:
 * initialize, then tools/call, over JSON-RPC lines on stdio.
 */
export class FakeMcpClient {
  constructor(private readonly timeoutMs = 30_000) {}

  async callTool(server: McpServerSpec, tool: string, args: Record<string, unknown>): Promise<string> {
    const child = spawn(server.command, server.args, {
      env: { ...process.env, ...Object.fromEntries(server.env.map(({ name, value }) => [name, value])) },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const replies = new Map<number, (message: Record<string, unknown>) => void>();
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      let message: unknown;
      try {
        message = JSON.parse(line);
      } catch {
        return;
      }
      if (isRecord(message) && typeof message.id === "number") replies.get(message.id)?.(message);
    });
    const request = (id: number, method: string, params: unknown) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`MCP ${method} timed out`)), this.timeoutMs);
        replies.set(id, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      });

    try {
      await request(1, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "fake-agent", version: "1.0.0" } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
      const reply = await request(2, "tools/call", { name: tool, arguments: args });
      if (reply.error !== undefined) throw new Error(`MCP tools/call failed: ${JSON.stringify(reply.error)}`);
      return toolText(reply.result);
    } finally {
      child.kill();
    }
  }
}
