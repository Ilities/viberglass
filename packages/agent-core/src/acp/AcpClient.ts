/**
 * Harness-agnostic ACP JSON-RPC 2.0 client over stdio.
 *
 * Manages the CLI subprocess, request/response correlation, session lifecycle
 * (initialize → session/new|resume|load → session/prompt), and notification routing.
 * One instance per job execution; stateless across jobs.
 */

import { spawn, ChildProcess } from "child_process";
import { Logger } from "winston";
import type { AcpMcpServer, PlatformSessionEvent } from "./types";
import { defaultAcpEventMapper } from "./acpEventMapper";
import { withWorkingDirectory } from "../workingDirectoryEnvironment";
import type { AcpEventMapper } from "./acpEventMapperTypes";
import { ToolCallStartFilter } from "./ToolCallStartFilter";
import { AcpTurnUsage } from "./AcpTurnUsage";
import { AcpSessionTotalsProbe, type AcpSessionTotals, type AcpUsageProbe } from "./AcpSessionTotalsProbe";
import type { AgentUsageReport } from "../usage";
import { approvePermissionRequest } from "./permissionReply";
import { AcpSessionOpener, describeSessionStart, sessionSupportOf, type AcpSessionStart } from "./AcpSessionOpener";
import { compactCommandOf, contextUsageOf, promptUsageOf, type AcpContextUsage } from "./acpSessionSignals";
import { describeLeftOutMcpServers, mcpServersSupportedBy } from "./mcpServerSupport";

export type AcpEventCallback = (event: PlatformSessionEvent) => void;

export interface AcpRunOptions {
  userMessage: string;
  /** CLI's own session ID (sess_abc123) — present on turns after the first. */
  acpSessionId?: string;
  /**
   * Sent instead of `userMessage` when the turn starts cold: a continued
   * session already has the context this carries, a fresh one doesn't.
   */
  coldStartMessage?: string;
  /**
   * After the turn, ask the harness to compact its context with these
   * instructions, when it has a compact command.
   */
  compactInstructions?: string;
  /** MCP servers the harness offers the agent as tools for this turn. */
  mcpServers?: AcpMcpServer[];
}

export interface AcpRunResult {
  acpSessionId: string;
  /** Whether the turn continued the harness's earlier session, or started cold and why. */
  sessionStart: AcpSessionStart;
  /** How full the harness's context was at the end of the turn, when it said. */
  contextUsage?: AcpContextUsage;
  /** Whether the harness compacted its context after the turn. */
  compacted: boolean;
  /** The turn's tokens and cost, when the harness reported them. */
  usage?: AgentUsageReport;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function spawnAcpProcess(
  command: string[],
  workDir: string,
  env: NodeJS.ProcessEnv,
  onLine: (line: string) => void,
  onStderr: (chunk: string) => void,
  timeoutMs: number,
): ChildProcess {
  const [cmd, ...args] = command;
  if (!cmd) throw new Error("ACP command is empty");

  const child = spawn(cmd, args, {
    cwd: workDir,
    env: withWorkingDirectory(env, workDir),
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buf = "";
  child.stdout?.on("data", (data: Buffer) => {
    buf += data.toString();
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const t = line.trim();
      if (t) onLine(t);
    }
  });

  child.stderr?.on("data", (data: Buffer) => onStderr(data.toString().trim()));

  const tid = setTimeout(() => child.kill(), timeoutMs);
  child.on("close", () => clearTimeout(tid));

  return child;
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/** A fresh session has used nothing before its first turn. */
const NOTHING_YET: AcpSessionTotals = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 };

export class AcpClient {
  private child?: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private currentSessionId = "";
  /** While `session/load` replays history the platform already has, its updates are dropped. */
  private replaying = false;
  private readonly mapper: AcpEventMapper;
  private readonly toolCallStarts = new ToolCallStartFilter();
  private readonly turnUsage = new AcpTurnUsage();
  private readonly totalsProbe?: AcpSessionTotalsProbe;
  private contextUsage?: AcpContextUsage;
  private compactCommand: string | null = null;

  constructor(
    private readonly command: string[],
    private readonly workDir: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly onEvent: AcpEventCallback,
    private readonly logger: Logger,
    private readonly timeoutMs: number,
    mapper?: AcpEventMapper,
    usageProbe?: AcpUsageProbe,
  ) {
    this.mapper = mapper ?? defaultAcpEventMapper;
    if (usageProbe) this.totalsProbe = new AcpSessionTotalsProbe(usageProbe);
  }

  async run(options: AcpRunOptions): Promise<AcpRunResult> {
    this.logger.info("AcpClient spawning process", {
      command: this.command.join(" "),
      workDir: this.workDir,
    });

    this.child = spawnAcpProcess(
      this.command, this.workDir, this.env,
      (line) => this.processLine(line),
      (chunk) => this.logger.warn(`[acp:stderr] ${chunk}`),
      this.timeoutMs,
    );

    this.child.on("error", (err) => {
      this.logger.error("AcpClient process spawn error", {
        command: this.command.join(" "),
        error: err.message,
      });
    });

    this.child.on("close", (code, signal) => {
      this.logger.info("AcpClient process exited", { code, signal });
    });

    try {
      const initialized = await this.sendRequest("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
      });
      this.turnUsage.noteInitialized(initialized);
      const opener = new AcpSessionOpener(
        (method, params) => this.sendRequest(method, params),
        this.workDir,
        (replaying) => (this.replaying = replaying),
        this.supportedMcpServers(initialized, options.mcpServers ?? []),
      );
      const opened = await opener.open(sessionSupportOf(initialized), options.acpSessionId);
      this.currentSessionId = opened.sessionId;
      let sessionStart = opened.start;
      this.reportSessionStart(sessionStart);

      const coldMessage = options.coldStartMessage ?? options.userMessage;
      this.turnUsage.startTurn(!sessionStart.resumed);
      let totalsBefore = sessionStart.resumed ? await this.sessionTotals() : NOTHING_YET;
      try {
        await this.prompt(sessionStart.resumed ? options.userMessage : coldMessage);
      } catch (error) {
        // A harness can accept a load and then fail every prompt (opencode from another directory).
        if (!sessionStart.resumed) throw error;
        sessionStart = { resumed: false, reason: "failed", detail: error instanceof Error ? error.message : String(error) };
        this.currentSessionId = await opener.create();
        this.reportSessionStart(sessionStart);
        this.turnUsage.startTurn(true);
        totalsBefore = NOTHING_YET;
        await this.prompt(coldMessage);
      }
      const compacted = await this.compact(options.compactInstructions);
      if (this.totalsProbe) this.turnUsage.noteTotals(totalsBefore, await this.sessionTotals());
      return { acpSessionId: this.currentSessionId, sessionStart, contextUsage: this.contextUsage, compacted, usage: this.turnUsage.report() };
    } finally {
      this.cleanup();
    }
  }

  private supportedMcpServers(initialized: unknown, servers: AcpMcpServer[]): AcpMcpServer[] {
    const { offered, leftOut } = mcpServersSupportedBy(initialized, servers);
    if (leftOut.length > 0) {
      this.logger.warn("AcpClient leaving out HTTP MCP servers the harness doesn't support", { leftOut });
      this.onEvent({ eventType: "progress", payload: { text: describeLeftOutMcpServers(leftOut) } });
    }
    return offered;
  }

  private async prompt(text: string): Promise<void> {
    this.logger.info("AcpClient sending prompt", { sessionId: this.currentSessionId });
    const result = await this.sendRequest("session/prompt", { sessionId: this.currentSessionId, prompt: [{ type: "text", text }] });
    this.contextUsage = promptUsageOf(result) ?? this.contextUsage;
    this.turnUsage.notePromptResult(result);
  }

  /** The session's totals from the harness's own command, for a harness that sends no usage over ACP. */
  private async sessionTotals(): Promise<AcpSessionTotals | null> {
    if (!this.totalsProbe) return null;
    this.totalsProbe.begin();
    try {
      await this.sendRequest("session/prompt", { sessionId: this.currentSessionId, prompt: [{ type: "text", text: this.totalsProbe.command }] });
    } catch (error) {
      this.logger.warn("AcpClient couldn't read the session's totals", { error: error instanceof Error ? error.message : String(error) });
    }
    return this.totalsProbe.end();
  }

  /** A failed compaction leaves the session as it was; the next cold start reads the summary instead. */
  private async compact(instructions: string | undefined): Promise<boolean> {
    if (!instructions || !this.compactCommand) return false;
    try {
      await this.prompt(`${this.compactCommand} ${instructions}`);
      return true;
    } catch (error) {
      this.logger.warn("AcpClient compaction failed", { error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private reportSessionStart(start: AcpSessionStart): void {
    this.logger.info("AcpClient session opened", { sessionId: this.currentSessionId, ...start });
    this.onEvent({ eventType: "progress", payload: { text: describeSessionStart(start), sessionStart: start } });
  }

  private processLine(line: string): void {
    let msg: unknown;
    try { msg = JSON.parse(line); } catch { return; }
    if (!isRecord(msg)) return;

    const hasId = typeof msg.id === "number";
    const hasMethod = typeof msg.method === "string";

    if (hasId && hasMethod) {
      this.handleCliRequest(msg.id as number, msg.method as string, msg.params);
    } else if (hasId) {
      const p = this.pending.get(msg.id as number);
      if (!p) return;
      this.pending.delete(msg.id as number);
      if (msg.error !== undefined) {
        const errMsg =
          isRecord(msg.error) && typeof msg.error.message === "string"
            ? msg.error.message : "ACP error";
        p.reject(new Error(errMsg));
      } else {
        p.resolve(msg.result);
      }
    } else if (hasMethod) {
      this.handleNotification(msg.method as string, msg.params);
    }
  }

  private handleCliRequest(id: number, method: string, params: unknown): void {
    if (method !== "session/request_permission") return;
    this.onEvent(this.mapper.mapPermissionRequest(params));
    this.child?.stdin?.write(
      JSON.stringify({ jsonrpc: "2.0", id, result: approvePermissionRequest(params) }) + "\n",
    );
  }

  private handleNotification(method: string, params: unknown): void {
    if (method !== "session/update") return;
    // The answer to a totals probe is read, not shown as something the agent said.
    if (this.totalsProbe?.capture(params)) return;
    // Commands are announced while a load replays history, so they're read before replayed updates are dropped.
    const command = compactCommandOf(params);
    if (command !== undefined) this.compactCommand = command;
    // A replayed usage update still says what the session had cost before this turn.
    this.turnUsage.noteSessionUpdate(params);
    if (this.replaying) return;
    this.contextUsage = contextUsageOf(params) ?? this.contextUsage;
    for (const event of this.mapper.mapSessionUpdate(params)) {
      if (this.toolCallStarts.keep(event)) this.onEvent(event);
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.child?.stdin?.write(msg, (err) => {
        if (err) { this.pending.delete(id); reject(err); }
      });
    });
  }

  private cleanup(): void {
    for (const p of this.pending.values()) p.reject(new Error("ACP client closed"));
    this.pending.clear();
    try { this.child?.kill(); } catch { /* best effort */ }
    this.child = undefined;
  }
}
