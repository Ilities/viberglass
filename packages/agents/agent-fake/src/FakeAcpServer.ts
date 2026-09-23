import { FakeTurnRunner } from "./FakeTurnRunner";

type JsonRpcId = number | string;

interface JsonRpcRequest {
  id: JsonRpcId;
  method: string;
  params: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseRequest(line: string): JsonRpcRequest | undefined {
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (!isRecord(message)) return undefined;
  const { id, method, params } = message;
  if (typeof id !== "number" && typeof id !== "string") return undefined;
  if (typeof method !== "string") return undefined;
  return { id, method, params: isRecord(params) ? params : {} };
}

function promptText(params: Record<string, unknown>): string {
  const blocks = Array.isArray(params.prompt) ? params.prompt : [];
  return blocks
    .map((block) =>
      isRecord(block) && typeof block.text === "string" ? block.text : "",
    )
    .join("\n");
}

/**
 * Minimal ACP agent over JSON-RPC lines: initialize, session/new,
 * session/load and session/prompt. Each prompt runs one fake turn in the
 * session's working directory.
 */
export class FakeAcpServer {
  private readonly sessionDirs = new Map<string, string>();
  private nextSession = 1;

  constructor(
    private readonly send: (message: Record<string, unknown>) => void,
    private readonly turnRunner: FakeTurnRunner = new FakeTurnRunner(),
    private readonly defaultCwd: string = process.cwd(),
  ) {}

  async handleLine(line: string): Promise<void> {
    const request = parseRequest(line);
    if (!request) return;

    try {
      const result = await this.dispatch(request);
      this.send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.send({
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -32000, message },
      });
    }
  }

  private async dispatch(request: JsonRpcRequest): Promise<unknown> {
    const { method, params } = request;
    switch (method) {
      case "initialize":
        return { protocolVersion: 1, agentCapabilities: { loadSession: true } };
      case "session/new":
        return { sessionId: this.openSession(params) };
      case "session/load":
        this.sessionDirs.set(String(params.sessionId), this.cwdOf(params));
        return {};
      case "session/prompt":
        return this.prompt(params);
      default:
        throw new Error(`Method not supported by fake agent: ${method}`);
    }
  }

  private openSession(params: Record<string, unknown>): string {
    const sessionId = `fake_sess_${this.nextSession++}`;
    this.sessionDirs.set(sessionId, this.cwdOf(params));
    return sessionId;
  }

  private async prompt(params: Record<string, unknown>): Promise<unknown> {
    const sessionId = String(params.sessionId);
    const repoDir = this.sessionDirs.get(sessionId) ?? this.defaultCwd;
    const message = await this.turnRunner.run(promptText(params), repoDir);

    this.send({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: message },
        },
      },
    });
    return { stopReason: "end_turn" };
  }

  private cwdOf(params: Record<string, unknown>): string {
    return typeof params.cwd === "string" ? params.cwd : this.defaultCwd;
  }
}
