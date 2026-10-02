import { ASK_HUMAN_TOOL, parseAskHumanInput, type AskHumanInput } from "./askHumanTool";

type JsonRpcId = number | string;

const PROTOCOL_VERSION = "2025-06-18";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The MCP server the agent asks people questions through, over JSON-RPC lines
 * on stdio. It offers one tool, `ask_human`, and hands each question to `ask`,
 * which returns what to tell the agent.
 */
export class AskHumanMcpServer {
  constructor(
    private readonly send: (message: Record<string, unknown>) => void,
    private readonly ask: (input: AskHumanInput) => Promise<string>,
  ) {}

  async handleLine(line: string): Promise<void> {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!isRecord(message) || typeof message.method !== "string") return;
    const id = message.id;
    // Notifications (initialized, cancelled) need no answer.
    if (typeof id !== "number" && typeof id !== "string") return;
    const params = isRecord(message.params) ? message.params : {};
    try {
      this.reply(id, await this.dispatch(message.method, params));
    } catch (error) {
      this.send({ jsonrpc: "2.0", id, error: { code: -32601, message: error instanceof Error ? error.message : String(error) } });
    }
  }

  private async dispatch(method: string, params: Record<string, unknown>): Promise<unknown> {
    switch (method) {
      case "initialize":
        return {
          protocolVersion: typeof params.protocolVersion === "string" ? params.protocolVersion : PROTOCOL_VERSION,
          capabilities: { tools: {} },
          serverInfo: { name: "viberglass", version: "1.0.0" },
        };
      case "ping":
        return {};
      case "tools/list":
        return { tools: [ASK_HUMAN_TOOL] };
      case "tools/call":
        return this.callTool(params);
      default:
        throw new Error(`Method not found: ${method}`);
    }
  }

  private async callTool(params: Record<string, unknown>): Promise<unknown> {
    if (params.name !== ASK_HUMAN_TOOL.name) return this.toolError(`Unknown tool: ${String(params.name)}`);
    const input = parseAskHumanInput(params.arguments);
    if ("error" in input) return this.toolError(input.error);
    try {
      return { content: [{ type: "text", text: await this.ask(input) }] };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return this.toolError(`The question couldn't be sent (${reason}). Say what you need to know in your reply instead.`);
    }
  }

  private toolError(text: string): unknown {
    return { content: [{ type: "text", text }], isError: true };
  }

  private reply(id: JsonRpcId, result: unknown): void {
    this.send({ jsonrpc: "2.0", id, result });
  }
}
