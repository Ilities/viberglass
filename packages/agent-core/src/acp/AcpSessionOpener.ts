/**
 * Opens the ACP session for a turn: continues the harness's earlier session
 * when it can, and says plainly when it can't.
 */

export type AcpSessionStart =
  | { resumed: true; via: "resume" | "load" }
  | { resumed: false; reason: "first_turn" | "not_supported" | "failed"; detail?: string };

import type { AcpMcpServer } from "./types";

export interface AcpAgentSessionSupport {
  load: boolean;
  resume: boolean;
}

type Request = (method: string, params: unknown) => Promise<unknown>;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** What the harness said it can do in its `initialize` reply. */
export function sessionSupportOf(initializeResult: unknown): AcpAgentSessionSupport {
  const capabilities = isRecord(initializeResult) && isRecord(initializeResult.agentCapabilities) ? initializeResult.agentCapabilities : {};
  const sessionCapabilities = isRecord(capabilities.sessionCapabilities) ? capabilities.sessionCapabilities : {};
  return { load: capabilities.loadSession === true, resume: isRecord(sessionCapabilities.resume) };
}

export class AcpSessionOpener {
  constructor(
    private readonly request: Request,
    private readonly cwd: string,
    /** Told while `session/load` replays history, which the platform already has. */
    private readonly onReplay: (replaying: boolean) => void,
    /** Offered on every open, since a harness starts a session's MCP servers again when it continues one. */
    private readonly mcpServers: AcpMcpServer[] = [],
  ) {}

  async open(support: AcpAgentSessionSupport, previousSessionId?: string): Promise<{ sessionId: string; start: AcpSessionStart }> {
    if (!previousSessionId) return { sessionId: await this.create(), start: { resumed: false, reason: "first_turn" } };
    // Resume doesn't replay history, which the platform already keeps, so it's preferred.
    const via = support.resume ? "resume" : support.load ? "load" : null;
    if (!via) return { sessionId: await this.create(), start: { resumed: false, reason: "not_supported" } };
    try {
      this.onReplay(via === "load");
      await this.request(`session/${via}`, { sessionId: previousSessionId, cwd: this.cwd, mcpServers: this.mcpServers });
      return { sessionId: previousSessionId, start: { resumed: true, via } };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { sessionId: await this.create(), start: { resumed: false, reason: "failed", detail } };
    } finally {
      this.onReplay(false);
    }
  }

  /** A fresh session, for a first turn or when the earlier one can't be continued. */
  async create(): Promise<string> {
    const result = await this.request("session/new", { cwd: this.cwd, mcpServers: this.mcpServers });
    return isRecord(result) && typeof result.sessionId === "string" ? result.sessionId : "";
  }
}

/** One plain sentence for the turn's progress, shown to people following the session. */
export function describeSessionStart(start: AcpSessionStart): string {
  if (start.resumed) return "Continued the agent's earlier session";
  if (start.reason === "first_turn") return "Started the agent's session";
  if (start.reason === "not_supported") return "Started a fresh agent session: this agent can't continue an earlier one";
  return "Started a fresh agent session: the earlier one couldn't be continued";
}
