/**
 * Harness-agnostic ACP JSON-RPC 2.0 client over stdio.
 *
 * Manages the CLI subprocess, request/response correlation, session lifecycle
 * (initialize → session/new|load → session/prompt), and notification routing.
 * One instance per job execution; stateless across jobs.
 *
 * Does NOT implement fs/ or terminal/ capabilities — the CLI has direct repo
 * access in the worker environment.
 */

import { spawn, ChildProcess } from "child_process";
import { Logger } from "winston";
import {
  PlatformSessionEvent,
  mapSessionUpdate,
  mapPermissionRequest,
  detectsNeedsInput,
} from "./acpEventMapper";

export type AcpEventCallback = (event: PlatformSessionEvent) => void;

export interface AcpRunOptions {
  userMessage: string;
  /** CLI's own session ID (sess_abc123) — present on turns after the first. */
  acpSessionId?: string;
}

export interface AcpRunResult {
  acpSessionId: string;
  turnOutcome: "completed" | "needs_input" | "needs_approval";
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Spawn the CLI subprocess, pipe stdout through a line splitter, and set a
 * hard timeout. Returns the ChildProcess for stdin writes.
 */
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

  const child = spawn(cmd, args, { cwd: workDir, env, stdio: ["pipe", "pipe", "pipe"] });

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
  private permissionRequestReceived = false;
  private lastAssistantText = "";
  private currentSessionId = "";

  constructor(
    private readonly command: string[],
    private readonly workDir: string,
    private readonly env: NodeJS.ProcessEnv,
    private readonly onEvent: AcpEventCallback,
    private readonly logger: Logger,
    private readonly timeoutMs: number,
  ) {}

  async run(options: AcpRunOptions): Promise<AcpRunResult> {
    this.child = spawnAcpProcess(
      this.command, this.workDir, this.env,
      (line) => this.processLine(line),
      (chunk) => this.logger.debug(`[acp:stderr] ${chunk}`),
      this.timeoutMs,
    );
    try {
      await this.sendRequest("initialize", { protocolVersion: "2025-01-01", capabilities: {} });
      if (options.acpSessionId) {
        this.currentSessionId = options.acpSessionId;
        await this.sendRequest("session/load", { sessionId: options.acpSessionId });
      } else {
        const r = await this.sendRequest("session/new", {});
        this.currentSessionId =
          isRecord(r) && typeof r.sessionId === "string" ? r.sessionId : "";
      }
      await this.sendRequest("session/prompt", {
        sessionId: this.currentSessionId,
        message: [{ type: "text", text: options.userMessage }],
      });
      const turnOutcome = this.permissionRequestReceived
        ? "needs_approval"
        : detectsNeedsInput(this.lastAssistantText)
          ? "needs_input"
          : "completed";
      return { acpSessionId: this.currentSessionId, turnOutcome };
    } finally {
      this.cleanup();
    }
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
    this.permissionRequestReceived = true;
    this.onEvent(mapPermissionRequest(params));
    // Respond reject_once so the CLI unblocks, then cancel the session.
    this.child?.stdin?.write(
      JSON.stringify({ jsonrpc: "2.0", id, result: { action: "reject_once" } }) + "\n",
    );
    this.child?.stdin?.write(
      JSON.stringify({
        jsonrpc: "2.0", id: this.nextId++, method: "session/cancel",
        params: { sessionId: this.currentSessionId },
      }) + "\n",
    );
  }

  private handleNotification(method: string, params: unknown): void {
    if (method !== "session/update") return;
    for (const event of mapSessionUpdate(params)) {
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
