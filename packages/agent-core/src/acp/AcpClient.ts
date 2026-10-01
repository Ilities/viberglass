/**
 * Harness-agnostic ACP JSON-RPC 2.0 client over stdio.
 *
 * Manages the CLI subprocess, request/response correlation, session lifecycle
 * (initialize → session/new|resume|load → session/prompt), and notification routing.
 * One instance per job execution; stateless across jobs.
 */

import { spawn, ChildProcess } from "child_process";
import { Logger } from "winston";
import type { PlatformSessionEvent } from "./types";
import { defaultAcpEventMapper } from "./acpEventMapper";
import { withWorkingDirectory } from "../workingDirectoryEnvironment";
import type { AcpEventMapper } from "./acpEventMapperTypes";
import { approvePermissionRequest } from "./permissionReply";
import { AcpSessionOpener, describeSessionStart, sessionSupportOf, type AcpSessionStart } from "./AcpSessionOpener";

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
}

export interface AcpRunResult {
  acpSessionId: string;
  turnOutcome: "completed" | "needs_input";
  /** Whether the turn continued the harness's earlier session, or started cold and why. */
  sessionStart: AcpSessionStart;
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

export class AcpClient {
  private child?: ChildProcess;
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();
  private lastAssistantText = "";
  private currentSessionId = "";
  /** While `session/load` replays history the platform already has, its updates are dropped. */
  private replaying = false;
  private readonly mapper: AcpEventMapper;

  constructor(
    private readonly command: string[],
    private readonly workDir: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly onEvent: AcpEventCallback,
    private readonly logger: Logger,
    private readonly timeoutMs: number,
    mapper?: AcpEventMapper,
  ) {
    this.mapper = mapper ?? defaultAcpEventMapper;
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
      const opener = new AcpSessionOpener(
        (method, params) => this.sendRequest(method, params),
        this.workDir,
        (replaying) => (this.replaying = replaying),
      );
      const opened = await opener.open(sessionSupportOf(initialized), options.acpSessionId);
      this.currentSessionId = opened.sessionId;
      let sessionStart = opened.start;
      this.reportSessionStart(sessionStart);

      const coldMessage = options.coldStartMessage ?? options.userMessage;
      try {
        await this.prompt(sessionStart.resumed ? options.userMessage : coldMessage);
      } catch (error) {
        // A harness can accept a load and then fail every prompt (opencode from another directory).
        if (!sessionStart.resumed) throw error;
        sessionStart = { resumed: false, reason: "failed", detail: error instanceof Error ? error.message : String(error) };
        this.currentSessionId = await opener.create();
        this.reportSessionStart(sessionStart);
        await this.prompt(coldMessage);
      }
      const turnOutcome = this.mapper.detectsNeedsInput(this.lastAssistantText)
        ? "needs_input"
        : "completed";
      return { acpSessionId: this.currentSessionId, turnOutcome, sessionStart };
    } finally {
      this.cleanup();
    }
  }

  private async prompt(text: string): Promise<void> {
    this.logger.info("AcpClient sending prompt", { sessionId: this.currentSessionId });
    await this.sendRequest("session/prompt", { sessionId: this.currentSessionId, prompt: [{ type: "text", text }] });
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
    if (method !== "session/update" || this.replaying) return;
    for (const event of this.mapper.mapSessionUpdate(params)) {
      this.onEvent(event);
      if (event.eventType === "assistant_message" && typeof event.payload.text === "string") {
        this.lastAssistantText = event.payload.text;
      }
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
