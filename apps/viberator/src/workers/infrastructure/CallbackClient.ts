import { Logger } from "winston";
import {
  FetchRetryConfig,
  fetchWithRetry,
  redactSensitiveInfo,
  isInternalLogMessage,
} from "./callbackFetch";

export interface CallbackResult {
  success: boolean;
  commitHash?: string;
  pullRequestUrl?: string;
  documentContent?: string;
  errorMessage?: string;
  logs: string[];
  changedFiles: string[];
  executionTime: number;
  branch?: string;
}

export class CallbackClient {
  private apiUrl: string;
  private maxRetries: number;
  private retryDelay: number;
  private callbackToken?: string;

  constructor(
    private logger: Logger,
    config: {
      platformUrl?: string;
      maxRetries?: number;
      retryDelay?: number;
      callbackToken?: string;
    } = {},
  ) {
    this.apiUrl =
      config.platformUrl ||
      process.env.PLATFORM_API_URL ||
      "http://localhost:8888";
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.callbackToken = config.callbackToken;
  }

  async sendResult(
    jobId: string,
    tenantId: string,
    result: CallbackResult,
  ): Promise<void> {
    const body = {
      ...result,
      logs: result.logs
        .filter((log) => !isInternalLogMessage(log))
        .map((log) => redactSensitiveInfo(log)),
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/result`,
      tenantId,
      body,
      { timeoutMs: 30000, label: "job result" },
      { jobId },
    );
  }

  async sendProgress(
    jobId: string,
    tenantId: string,
    progress: {
      step?: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    const body = {
      step: progress.step || null,
      message: redactSensitiveInfo(progress.message),
      details: progress.details || null,
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/progress`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "job progress" },
      { jobId },
    );
  }

  async sendCodexAuthCache(
    jobId: string,
    tenantId: string,
    payload: {
      secretName: string;
      authJson: string;
      updatedAt?: string;
    },
  ): Promise<void> {
    const body = {
      secretName: payload.secretName,
      authJson: payload.authJson,
      updatedAt: payload.updatedAt || new Date().toISOString(),
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/codex-auth-cache`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "Codex auth cache" },
      { jobId, secretName: payload.secretName },
    );
  }

  async sendLog(
    jobId: string,
    tenantId: string,
    log: {
      level: "info" | "warn" | "error" | "debug";
      message: string;
      source?: string;
    },
  ): Promise<void> {
    if (isInternalLogMessage(log.message)) {
      return;
    }

    const body = {
      level: log.level,
      message: redactSensitiveInfo(log.message),
      source: log.source || null,
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/logs`,
      tenantId,
      body,
      { timeoutMs: 5000, label: "job log" },
      { jobId },
    );
  }

  async sendLogBatch(
    jobId: string,
    tenantId: string,
    logs: Array<{
      level: "info" | "warn" | "error" | "debug";
      message: string;
      source?: string;
      internal?: boolean;
    }>,
  ): Promise<void> {
    if (logs.length === 0) return;

    const externalLogs = logs.filter(
      (log) => !log.internal && !isInternalLogMessage(log.message),
    );
    if (externalLogs.length === 0) return;

    const body = {
      logs: externalLogs.map((log) => ({
        level: log.level,
        message: redactSensitiveInfo(log.message),
        source: log.source || null,
      })),
    };

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/logs/batch`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "batch job logs" },
      { jobId, count: externalLogs.length },
    );
  }

  async sendSessionEventBatch(
    jobId: string,
    tenantId: string,
    events: Array<{ eventType: string; payload: Record<string, unknown> }>,
  ): Promise<void> {
    if (events.length === 0) return;

    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/session-events/batch`,
      tenantId,
      { events },
      { timeoutMs: 10000, label: "session event batch" },
      { jobId, count: events.length },
    );
  }

  async sendAcpSessionId(
    jobId: string,
    tenantId: string,
    acpSessionId: string,
  ): Promise<void> {
    await this.post(
      `${this.apiUrl}/api/jobs/${jobId}/acp-session-id`,
      tenantId,
      { acpSessionId },
      { timeoutMs: 10000, label: "ACP session ID" },
      { jobId },
    );
  }

  private async post(
    url: string,
    tenantId: string,
    body: unknown,
    config: FetchRetryConfig,
    context: Record<string, unknown>,
  ): Promise<void> {
    await fetchWithRetry(url, tenantId, body, config, context, {
      logger: this.logger,
      maxRetries: this.maxRetries,
      retryDelay: this.retryDelay,
      callbackToken: this.callbackToken,
    });
  }

}

