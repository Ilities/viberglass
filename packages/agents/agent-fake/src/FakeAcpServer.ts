import { randomUUID } from "crypto";
import { FakeSessionStore } from "./FakeSessionStore";
import { FakeTurnRunner } from "./FakeTurnRunner";
import { planFakeTurn } from "./fakeTurnPlan";

/** Like Claude Code, it announces a compact command, which the platform runs after a summary. */
const COMPACT_COMMAND = "/compact";
const CONTEXT_SIZE = 200_000;

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
 * session's working directory. Sessions are kept in its state directory, so a
 * later process continues one the way a real harness does, and a session
 * whose state is gone can't be loaded.
 */
export class FakeAcpServer {
  private readonly sessionDirs = new Map<string, string>();

  constructor(
    private readonly send: (message: Record<string, unknown>) => void,
    private readonly turnRunner: FakeTurnRunner = new FakeTurnRunner(),
    private readonly defaultCwd: string = process.cwd(),
    private readonly sessions: FakeSessionStore = new FakeSessionStore(),
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
      case "session/new": {
        const sessionId = this.openSession(params);
        this.announceCommands(sessionId);
        return { sessionId };
      }
      case "session/load": {
        const sessionId = String(params.sessionId);
        if (!this.sessions.exists(sessionId)) throw new Error("Resource not found");
        this.sessionDirs.set(sessionId, this.cwdOf(params));
        this.announceCommands(sessionId);
        return {};
      }
      case "session/prompt":
        return this.prompt(params);
      default:
        throw new Error(`Method not supported by fake agent: ${method}`);
    }
  }

  private openSession(params: Record<string, unknown>): string {
    const sessionId = `fake_sess_${randomUUID()}`;
    this.sessions.create(sessionId);
    this.sessionDirs.set(sessionId, this.cwdOf(params));
    return sessionId;
  }

  private async prompt(params: Record<string, unknown>): Promise<unknown> {
    const sessionId = String(params.sessionId);
    const text = promptText(params);
    if (text.startsWith(COMPACT_COMMAND)) {
      this.update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Compacted the conversation." } });
      return { stopReason: "end_turn" };
    }
    const repoDir = this.sessionDirs.get(sessionId) ?? this.defaultCwd;
    const turn = this.sessions.recordTurn(sessionId);
    const message = await this.turnRunner.run(text, repoDir, turn);

    this.update(sessionId, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: message } });
    const usage = planFakeTurn(text).usageTokens;
    if (usage !== null) this.update(sessionId, { sessionUpdate: "usage_update", used: usage, size: CONTEXT_SIZE });
    return { stopReason: "end_turn" };
  }

  private announceCommands(sessionId: string): void {
    this.update(sessionId, {
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: COMPACT_COMMAND.slice(1), description: "Compact the conversation" }],
    });
  }

  private update(sessionId: string, update: Record<string, unknown>): void {
    this.send({ jsonrpc: "2.0", method: "session/update", params: { sessionId, update } });
  }

  private cwdOf(params: Record<string, unknown>): string {
    return typeof params.cwd === "string" ? params.cwd : this.defaultCwd;
  }
}
