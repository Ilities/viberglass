/**
 * Harness-agnostic ACP JSON-RPC 2.0 client over stdio.
 *
 * Manages the CLI subprocess, request/response correlation, session lifecycle
 * (initialize → session/new|load → session/prompt), and notification routing.
 * One instance per job execution; stateless across jobs.
 */

import { spawn, ChildProcess } from "child_process";
import { Logger } from "winston";
import type { PlatformSessionEvent } from "./types";
import { defaultAcpEventMapper } from "./acpEventMapper";
import type { AcpEventMapper } from "./acpEventMapperTypes";

export type AcpEventCallback = (event: PlatformSessionEvent) => void;

export interface AcpRunOptions {
  userMessage: string;
  /** CLI's own session ID (sess_abc123) — present on turns after the first. */
  acpSessionId?: string;
}

export interface AcpRunResult {
  acpSessionId: string;
  turnOutcome: "completed" | "needs_input";
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
  private lastAssistantText = "";
  private currentSessionId = "";
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
      this.logger.info("AcpClient sending initialize request");
      await this.sendRequest("initialize", { protocolVersion: 1, capabilities: {} });
      this.logger.info("AcpClient initialize succeeded");

      if (options.acpSessionId) {
        this.logger.info("AcpClient loading existing session", { acpSessionId: options.acpSessionId });
        try {
          await this.sendRequest("session/load", { sessionId: options.acpSessionId, cwd: this.workDir, mcpServers: [] });
          this.currentSessionId = options.acpSessionId;
        } catch (loadErr) {
          this.logger.warn("AcpClient session/load failed, starting new session", {
            error: loadErr instanceof Error ? loadErr.message : String(loadErr),
          });
          const r = await this.sendRequest("session/new", { cwd: this.workDir, mcpServers: [] });
          this.currentSessionId =
            isRecord(r) && typeof r.sessionId === "string" ? r.sessionId : "";
        }
      } else {
        this.logger.info("AcpClient creating new session");
        const r = await this.sendRequest("session/new", { cwd: this.workDir, mcpServers: [] });
        this.currentSessionId =
          isRecord(r) && typeof r.sessionId === "string" ? r.sessionId : "";
        this.logger.info("AcpClient session created", { sessionId: this.currentSessionId });
      }
      this.logger.info("AcpClient sending prompt", { sessionId: this.currentSessionId });
      await this.sendRequest("session/prompt", {
        sessionId: this.currentSessionId,
        prompt: [{ type: "text", text: options.userMessage }],
      });
      const turnOutcome = this.mapper.detectsNeedsInput(this.lastAssistantText)
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
    this.onEvent(this.mapper.mapPermissionRequest(params));
    this.child?.stdin?.write(
      JSON.stringify({ jsonrpc: "2.0", id, result: { action: "allow_once" } }) + "\n",
    );
  }

  private handleNotification(method: string, params: unknown): void {
    if (method !== "session/update") return;
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
