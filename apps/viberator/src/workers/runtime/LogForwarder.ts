import { Writable } from "stream";
import { Logger, transports } from "winston";
import type TransportStream from "winston-transport";
import { CallbackClient } from "../infrastructure/CallbackClient";

export type WorkerLogLevel = "info" | "warn" | "error" | "debug";

interface BufferedLog {
  level: WorkerLogLevel;
  message: string;
  source: string;
}

const INTERNAL_LOG_TAG = "[internal]";
const MAX_LOG_MESSAGE_LENGTH = 5000;

function getField(entry: unknown, fieldName: string): unknown {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return undefined;
  }

  for (const [key, value] of Object.entries(entry)) {
    if (key === fieldName) {
      return value;
    }
  }

  return undefined;
}

function extractLevel(entry: unknown): WorkerLogLevel {
  const rawLevel = getField(entry, "level");
  if (
    rawLevel === "info" ||
    rawLevel === "warn" ||
    rawLevel === "error" ||
    rawLevel === "debug"
  ) {
    return rawLevel;
  }

  return "info";
}

function resolveLogMessage(message: unknown, fallback: string): string {
  if (typeof message === "string") {
    return message;
  }

  if (message !== undefined) {
    return JSON.stringify(message);
  }

  return fallback;
}

function normalizeMessage(message: string): string {
  if (message.length <= MAX_LOG_MESSAGE_LENGTH) {
    return message;
  }

  const suffix = "... [truncated]";
  return `${message.slice(0, MAX_LOG_MESSAGE_LENGTH - suffix.length)}${suffix}`;
}

export class LogForwarder {
  private currentJobId?: string;
  private currentTenantId?: string;
  private logBuffer: string[] = [];
  private logBatch: BufferedLog[] = [];
  private logBatchTimer?: NodeJS.Timeout;
  private callbackTransport?: TransportStream;
  private pendingChunk = "";

  constructor(
    private readonly logger: Logger,
    private readonly callbackClient: CallbackClient,
    private readonly batchSize: number = 10,
    private readonly batchIntervalMs: number = 2000,
  ) {}

  setupForJob(jobId: string, tenantId: string): void {
    this.cleanupTransport();
    this.currentJobId = jobId;
    this.currentTenantId = tenantId;
    this.logBuffer = [];
    this.logBatch = [];
    this.pendingChunk = "";

    const logStream = new Writable({
      write: (chunk: Buffer, _encoding: string, callback: () => void) => {
        this.handleChunk(chunk);
        callback();
      },
    });

    this.callbackTransport = new transports.Stream({
      stream: logStream,
    });

    this.logger.add(this.callbackTransport);
  }

  getLogs(): string[] {
    return [...this.logBuffer];
  }

  flush(): void {
    this.processPendingChunk();

    if (this.logBatchTimer) {
      clearTimeout(this.logBatchTimer);
      this.logBatchTimer = undefined;
    }

    if (this.logBatch.length === 0) {
      return;
    }

    const batch = [...this.logBatch];
    this.logBatch = [];

    if (this.currentJobId && this.currentTenantId) {
      this.callbackClient
        .sendLogBatch(this.currentJobId, this.currentTenantId, batch)
        .catch((error) => {
          console.error("Failed to forward log batch:", error);
        });
    }
  }

  cleanup(): void {
    this.flush();

    if (this.logBatchTimer) {
      clearTimeout(this.logBatchTimer);
      this.logBatchTimer = undefined;
    }

    this.currentJobId = undefined;
    this.currentTenantId = undefined;
    this.cleanupTransport();
  }

  private handleChunk(chunk: Buffer): void {
    this.pendingChunk += chunk.toString();
    const lines = this.pendingChunk.split(/\r?\n/);
    this.pendingChunk = lines.pop() || "";

    for (const line of lines) {
      this.processLogLine(line);
    }
  }

  private processPendingChunk(): void {
    if (!this.pendingChunk.trim()) {
      this.pendingChunk = "";
      return;
    }
    this.processLogLine(this.pendingChunk);
    this.pendingChunk = "";
  }

  private processLogLine(rawLine: string): void {
    const line = rawLine.trim();
    if (!line) return;

    try {
      const logEntry = JSON.parse(line);
      const level = extractLevel(logEntry);
      const logMessage = resolveLogMessage(getField(logEntry, "message"), line);
      this.enqueueLog(level, logMessage);
    } catch (_error) {
      this.enqueueLog("info", line);
    }
  }

  private enqueueLog(level: WorkerLogLevel, message: string): void {
    if (message.includes(INTERNAL_LOG_TAG)) {
      return;
    }

    const normalizedMessage = normalizeMessage(message);
    this.logBuffer.push(`[${level}] ${normalizedMessage}`);
    this.logBatch.push({
      level,
      message: normalizedMessage,
      source: "viberator",
    });

    if (this.logBatch.length >= this.batchSize) {
      this.flush();
      return;
    }

    if (!this.logBatchTimer) {
      this.logBatchTimer = setTimeout(() => {
        this.flush();
      }, this.batchIntervalMs);
    }
  }

  private cleanupTransport(): void {
    if (!this.callbackTransport) return;
    this.logger.remove(this.callbackTransport);
    if (typeof this.callbackTransport.close === "function") {
      this.callbackTransport.close();
    }
    this.callbackTransport = undefined;
  }
}
