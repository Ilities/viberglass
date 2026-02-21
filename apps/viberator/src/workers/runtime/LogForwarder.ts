import { Writable } from "stream";
import { Logger, transports } from "winston";
import { CallbackClient } from "../infrastructure/CallbackClient";

export type WorkerLogLevel = "info" | "warn" | "error" | "debug";

interface BufferedLog {
  level: WorkerLogLevel;
  message: string;
  source: string;
}

export class LogForwarder {
  private currentJobId?: string;
  private currentTenantId?: string;
  private logBuffer: string[] = [];
  private logBatch: BufferedLog[] = [];
  private logBatchTimer?: NodeJS.Timeout;

  constructor(
    private readonly logger: Logger,
    private readonly callbackClient: CallbackClient,
    private readonly batchSize: number = 10,
    private readonly batchIntervalMs: number = 2000,
  ) {}

  setupForJob(jobId: string, tenantId: string): void {
    this.currentJobId = jobId;
    this.currentTenantId = tenantId;
    this.logBuffer = [];
    this.logBatch = [];

    const logStream = new Writable({
      write: (chunk: Buffer, _encoding: string, callback: () => void) => {
        this.handleChunk(chunk);
        callback();
      },
    });

    const callbackTransport = new transports.Stream({
      stream: logStream,
    });

    this.logger.add(callbackTransport);
  }

  getLogs(): string[] {
    return [...this.logBuffer];
  }

  flush(): void {
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
  }

  private handleChunk(chunk: Buffer): void {
    try {
      const message = chunk.toString();
      const logEntry = JSON.parse(message);
      const level = this.extractLevel(logEntry);
      const logMessage = this.resolveLogMessage(
        this.extractMessage(logEntry),
        message,
      );

      this.logBuffer.push(`[${level}] ${logMessage}`);
      this.logBatch.push({
        level,
        message: logMessage,
        source: "viberator",
      });

      if (this.logBatch.length >= this.batchSize) {
        this.flush();
      } else if (!this.logBatchTimer) {
        this.logBatchTimer = setTimeout(() => {
          this.flush();
        }, this.batchIntervalMs);
      }
    } catch (_error) {
      this.logBuffer.push(chunk.toString());
    }
  }

  private extractLevel(entry: unknown): WorkerLogLevel {
    const rawLevel = this.getField(entry, "level");
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

  private extractMessage(entry: unknown): unknown {
    return this.getField(entry, "message");
  }

  private getField(entry: unknown, fieldName: string): unknown {
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

  private resolveLogMessage(message: unknown, fallback: string): string {
    if (typeof message === "string") {
      return message;
    }

    if (message !== undefined) {
      return JSON.stringify(message);
    }

    return fallback;
  }
}
