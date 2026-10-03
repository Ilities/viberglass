import * as fs from "fs";
import * as path from "path";
import type { AcpMcpServer } from "@viberglass/agent-core";

/** The worker's own server (the agent's questions to people), which Pi should offer without a tool search. */
const DIRECT_SERVERS = new Set(["viberglass"]);

type PiMcpEntry =
  | { command: string; args: string[]; env: Record<string, string>; exposure?: "direct" }
  | { url: string; headers: Record<string, string>; exposure?: "direct" };

function entryOf(server: AcpMcpServer): PiMcpEntry {
  const exposure = DIRECT_SERVERS.has(server.name) ? { exposure: "direct" as const } : {};
  if ("type" in server) {
    return { url: server.url, headers: Object.fromEntries(server.headers.map((h) => [h.name, h.value])), ...exposure };
  }
  return { command: server.command, args: server.args, env: Object.fromEntries(server.env.map((e) => [e.name, e.value])), ...exposure };
}

/** Pi reads user-level MCP servers from `mcp.json` in its agent directory. */
export function piAgentDirectory(env: NodeJS.ProcessEnv): string {
  return env.PI_CODING_AGENT_DIR || path.join(env.HOME || "/tmp", ".pi", "agent");
}

/**
 * Writes the run's MCP servers to Pi's own `mcp.json`, replacing any earlier
 * run's. Header values are written as they are, so the file is private to the
 * worker's user and kept out of the archived session state.
 */
export function writePiMcpConfig(agentDir: string, servers: AcpMcpServer[]): void {
  const file = path.join(agentDir, "mcp.json");
  if (servers.length === 0) {
    fs.rmSync(file, { force: true });
    return;
  }
  const mcpServers = Object.fromEntries(servers.map((server) => [server.name, entryOf(server)]));
  fs.mkdirSync(agentDir, { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify({ mcpServers }, null, 2)}\n`, { mode: 0o600 });
}
