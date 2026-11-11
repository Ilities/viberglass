/**
 * Harness-agnostic ACP JSON-RPC 2.0 client over stdio.
 *
 * Manages the CLI subprocess, request/response correlation, session lifecycle
 * (initialize → session/new|resume|load → session/prompt), and notification routing.
 * One instance per job execution; stateless across jobs.
 */

import type { ChildProcess } from "child_process";
import { Logger } from "winston";
import type { AcpMcpServer, PlatformSessionEvent } from "./types";
import { defaultAcpEventMapper } from "./acpEventMapper";
import type { AcpEventMapper } from "./acpEventMapperTypes";
import { ToolCallStartFilter } from "./ToolCallStartFilter";
import { AcpTurnUsage } from "./AcpTurnUsage";
import { AcpSessionUsage } from "./AcpSessionUsage";
import type { AcpRunOptions, AcpRunResult } from "./acpRunTypes";
import { AcpSessionTotalsProbe, type AcpSessionTotals, type AcpUsageProbe } from "./AcpSessionTotalsProbe";
import { approvePermissionRequest } from "./permissionReply";
import { AcpSessionOpener, describeSessionStart, sessionSupportOf, type AcpSessionStart } from "./AcpSessionOpener";
import { compactCommandOf, contextUsageOf, promptUsageOf, responseModelOf, type AcpContextUsage } from "./acpSessionSignals";
import { describeLeftOutMcpServers, mcpServersSupportedBy } from "./mcpServerSupport";
import { signalProcessGroup, stopAcpProcess } from "./stopAcpProcess";
import { spawnAcpProcess } from "./spawnAcpProcess";
import { acpErrorMessage } from "./acpErrorMessage";
import { TURN_FAILURE_CAPABILITY_META, turnFailureOf } from "./acpTurnFailure";
import { AcpRunTimers } from "./AcpRunTimers";
import { ProviderRetryWatch } from "./ProviderRetryWatch";
import { AcpTurnFailedError } from "./AcpTurnFailedError";

export type { AcpRunOptions, AcpRunResult } from "./acpRunTypes";
export type AcpEventCallback = (event: PlatformSessionEvent) => void;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

interface PendingRequest {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

/** A fresh session has used nothing before its first turn. */
const NOTHING_YET: AcpSessionTotals = { inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0, cacheCreationInputTokens: 0, costUsd: 0 };

/** Long enough for a quiet tool call such as a test suite; a working harness streams updates while its model runs. */
const STALL_AFTER_MS = 20 * 60_000;

export interface AcpClientLimits {
  /** How long the harness may stay quiet before its turn fails as stalled. */
  stallAfterMs?: number;
  /** How often the harness's records of provider refusals are read. */
  providerRetryPollMs?: number;
}

export class AcpClient {
  private child?: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private currentSessionId = "";
  private readonly turnSessionIds: string[] = [];
  /** While `session/load` replays history the platform already has, its updates are dropped. */
  private replaying = false;
  private readonly mapper: AcpEventMapper;
  private readonly toolCallStarts = new ToolCallStartFilter();
  private turnUsage = new AcpTurnUsage();
  private readonly totalsProbe?: AcpSessionTotalsProbe;
  private contextUsage?: AcpContextUsage;
  private responseModel?: string;
  private compactCommand: string | null = null;
  /** Why the harness process went away, once it has; requests after that fail straight away. */
  private exitReason?: string;
  private timers?: AcpRunTimers;
  private retryWatch?: ProviderRetryWatch;

  constructor(
    private readonly command: string[],
    private readonly workDir: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly onEvent: AcpEventCallback,
    private readonly logger: Logger,
    private readonly timeoutMs: number,
    mapper?: AcpEventMapper,
    usageProbe?: AcpUsageProbe,
    private readonly limits: AcpClientLimits = {},
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
    );

    const child = this.child;
    // Failing the turn right away lets cleanup escalate to SIGKILL if the harness ignores SIGTERM.
    const stop = (reason: string) => {
      this.stopWatching();
      this.failPending(reason);
      signalProcessGroup(child, "SIGTERM");
    };
    const stallAfterMs = this.limits.stallAfterMs ?? STALL_AFTER_MS;
    this.timers = new AcpRunTimers(this.timeoutMs, stallAfterMs, stop, (text) => {
      this.logger.warn("AcpClient harness has gone quiet", { quietForMs: stallAfterMs / 2 });
      this.onEvent({ eventType: "progress", payload: { text } });
    });
    this.timers.start();
    if (options.providerRetries) this.retryWatch = new ProviderRetryWatch(options.providerRetries, stop, this.limits.providerRetryPollMs);

    child.on("error", (err) => {
      this.logger.error("AcpClient process spawn error", { command: this.command.join(" "), error: err.message });
      this.failPending(`Agent process failed to start: ${err.message}`);
    });

    child.on("close", (code, signal) => {
      this.stopWatching();
      this.logger.info("AcpClient process exited", { code, signal });
      this.failPending(`Agent process exited unexpectedly (${signal ?? `code ${code}`})`);
    });

    if (options.sessionUsage) this.turnUsage = new AcpTurnUsage(new AcpSessionUsage(options.sessionUsage));
    const turnStartedAt = Date.now();
    const noteRecordedUsage = () => this.turnUsage.noteRecordedUsage(options.turnTokens?.since(this.turnSessionIds, turnStartedAt) ?? null);
    try {
      const initialized = await this.sendRequest("initialize", {
        protocolVersion: 1,
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false, _meta: TURN_FAILURE_CAPABILITY_META },
      });
      this.turnUsage.noteInitialized(initialized);
      const opener = new AcpSessionOpener(
        (method, params) => this.sendRequest(method, params),
        this.workDir,
        (replaying) => (this.replaying = replaying),
        this.supportedMcpServers(initialized, options.mcpServers ?? []),
      );
      const opened = await opener.open(sessionSupportOf(initialized), options.acpSessionId);
      this.useSession(opened.sessionId);
      let sessionStart = opened.start;
      this.reportSessionStart(sessionStart);

      const coldMessage = options.coldStartMessage ?? options.userMessage;
      this.turnUsage.startTurn(!sessionStart.resumed);
      let totalsBefore = sessionStart.resumed ? await this.sessionTotals() : NOTHING_YET;
      let turn: unknown;
      try {
        turn = await this.prompt(sessionStart.resumed ? options.userMessage : coldMessage);
      } catch (error) {
        // A harness can accept a load and then fail every prompt (opencode from another directory).
        if (!sessionStart.resumed) throw error;
        sessionStart = { resumed: false, reason: "failed", detail: error instanceof Error ? error.message : String(error) };
        this.useSession(await opener.create());
        this.reportSessionStart(sessionStart);
        this.turnUsage.startTurn(true);
        totalsBefore = NOTHING_YET;
        turn = await this.prompt(coldMessage);
      }
      const failure = turnFailureOf(turn);
      if (failure) throw new Error(failure);
      const compacted = await this.compact(options.compactInstructions);
      if (this.totalsProbe) this.turnUsage.noteTotals(totalsBefore, await this.sessionTotals());
      noteRecordedUsage();
      return { acpSessionId: this.currentSessionId, sessionStart, contextUsage: this.contextUsage, compacted, usage: this.turnUsage.report(), model: this.responseModel ?? opener.model };
    } catch (error) {
      if (this.currentSessionId) noteRecordedUsage();
      throw new AcpTurnFailedError(error instanceof Error ? error.message : String(error), this.turnUsage.report(), this.responseModel);
    } finally {
      await this.cleanup();
    }
  }

  private useSession(sessionId: string): void {
    this.currentSessionId = sessionId;
    this.turnSessionIds.push(sessionId);
    this.retryWatch?.start(sessionId);
  }

  private supportedMcpServers(initialized: unknown, servers: AcpMcpServer[]): AcpMcpServer[] {
    const { offered, leftOut } = mcpServersSupportedBy(initialized, servers);
    if (leftOut.length > 0) {
      this.logger.warn("AcpClient leaving out HTTP MCP servers the harness doesn't support", { leftOut });
      this.onEvent({ eventType: "progress", payload: { text: describeLeftOutMcpServers(leftOut) } });
    }
    return offered;
  }

  private async prompt(text: string): Promise<unknown> {
    this.logger.info("AcpClient sending prompt", { sessionId: this.currentSessionId });
    const result = await this.sendRequest("session/prompt", { sessionId: this.currentSessionId, prompt: [{ type: "text", text }] });
    // The harness's own context report is the better measure; a turn's usage is the fallback.
    this.contextUsage = this.contextUsage ?? promptUsageOf(result) ?? undefined;
    this.turnUsage.notePromptResult(result);
    return result;
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
    return this.totalsProbe.end(this.currentSessionId);
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
    this.timers?.heard();
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
        p.reject(new Error(acpErrorMessage(msg.error)));
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
    this.turnUsage.noteMessageUsage(params);
    this.contextUsage = contextUsageOf(params) ?? this.contextUsage;
    this.responseModel = responseModelOf(params) ?? this.responseModel;
    for (const event of this.mapper.mapSessionUpdate(params)) {
      if (this.toolCallStarts.keep(event)) this.onEvent(event);
    }
  }

  private sendRequest(method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (this.exitReason) return reject(new Error(this.exitReason));
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      this.child?.stdin?.write(msg, (err) => {
        if (err) { this.pending.delete(id); reject(err); }
      });
    });
  }

  private stopWatching(): void {
    this.timers?.stop();
    this.retryWatch?.stop();
  }

  private failPending(reason: string): void {
    this.exitReason ??= reason;
    for (const p of this.pending.values()) p.reject(new Error(reason));
    this.pending.clear();
  }

  private async cleanup(): Promise<void> {
    this.stopWatching();
    this.failPending("ACP client closed");
    const child = this.child;
    this.child = undefined;
    if (child) await stopAcpProcess(child);
  }
}
