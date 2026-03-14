import { Logger } from "winston";

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

interface RetryConfig {
  timeoutMs: number;
  label: string;
}

export class CallbackClient {
  private static readonly INTERNAL_LOG_TAG = "[internal]";
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

  private buildHeaders(tenantId: string): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Tenant-Id": tenantId,
    };
    if (this.callbackToken) {
      headers["X-Callback-Token"] = this.callbackToken;
    }
    return headers;
  }

  async sendResult(
    jobId: string,
    tenantId: string,
    result: CallbackResult,
  ): Promise<void> {
    const body = {
      ...result,
      logs: result.logs
        .filter((log) => !this.isInternalLogMessage(log))
        .map((log) => this.redactSensitiveInfo(log)),
    };

    await this.fetchWithRetry(
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
      message: this.redactSensitiveInfo(progress.message),
      details: progress.details || null,
    };

    await this.fetchWithRetry(
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

    await this.fetchWithRetry(
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
    if (this.isInternalLogMessage(log.message)) {
      return;
    }

    const body = {
      level: log.level,
      message: this.redactSensitiveInfo(log.message),
      source: log.source || null,
    };

    await this.fetchWithRetry(
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
      (log) => !log.internal && !this.isInternalLogMessage(log.message),
    );
    if (externalLogs.length === 0) return;

    const body = {
      logs: externalLogs.map((log) => ({
        level: log.level,
        message: this.redactSensitiveInfo(log.message),
        source: log.source || null,
      })),
    };

    await this.fetchWithRetry(
      `${this.apiUrl}/api/jobs/${jobId}/logs/batch`,
      tenantId,
      body,
      { timeoutMs: 10000, label: "batch job logs" },
      { jobId, count: externalLogs.length },
    );
  }

  private async fetchWithRetry(
    url: string,
    tenantId: string,
    body: unknown,
    config: RetryConfig,
    context: Record<string, unknown>,
  ): Promise<void> {
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(
          this.tagInternalLog(`Sending ${config.label} to platform`),
          { ...context, attempt: attempt + 1 },
        );

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(tenantId),
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(config.timeoutMs),
        });

        if (!response.ok) {
          const statusCode = response.status;
          const errorData = await response
            .json()
            .catch(() => ({ error: response.statusText }));
          const errorMessage =
            typeof errorData?.error === "string"
              ? errorData.error
              : response.statusText;

          // Idempotency: another worker retry may have already finalized this job.
          if (
            statusCode === 409 &&
            errorMessage === "Job already in terminal state"
          ) {
            this.logger.warn(
              this.tagInternalLog(
                `${config.label} callback skipped because job is already terminal`,
              ),
              { ...context, statusCode, message: errorMessage },
            );
            return;
          }

          const isRetryable = statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            this.logger.error(
              this.tagInternalLog(
                `Non-retryable error sending ${config.label}`,
              ),
              { ...context, statusCode, message: errorMessage },
            );
            throw new Error(
              `${config.label} callback failed: ${errorMessage}`,
            );
          }

          if (attempt === this.maxRetries) {
            this.logger.error(
              this.tagInternalLog(
                `Max retries exceeded sending ${config.label}`,
              ),
              { ...context, lastStatus: statusCode },
            );
            throw new Error(
              `${config.label} callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          const delay = this.retryDelay * Math.pow(2, attempt);
          this.logger.warn(
            this.tagInternalLog(
              `Retryable error sending ${config.label}, will retry`,
            ),
            { ...context, attempt: attempt + 1, statusCode, delay },
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.info(
          this.tagInternalLog(`${config.label} sent successfully`),
          { ...context, status: response.status },
        );
        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;

        if (error instanceof Error && error.name === "AbortError") {
          this.logger.error(
            this.tagInternalLog(`${config.label} request timeout`),
            { ...context, attempt: attempt + 1 },
          );
          if (isLastAttempt) {
            throw new Error(
              `${config.label} callback timeout after ${this.maxRetries + 1} attempts`,
            );
          }
        } else if (
          error instanceof Error &&
          error.message.includes("callback failed")
        ) {
          throw error;
        } else {
          this.logger.error(
            this.tagInternalLog(
              `Unexpected error sending ${config.label}`,
            ),
            {
              ...context,
              attempt: attempt + 1,
              error: error instanceof Error ? error.message : String(error),
            },
          );
          if (isLastAttempt) {
            throw error;
          }
        }

        const delay = this.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
  }

  private redactSensitiveInfo(log: string): string {
    const sensitivePatterns = [
      /token[a-z]*["\s:=]+[a-zA-Z0-9_\-]{20,}/gi,
      /password["\s:=]+[^\s]+/gi,
      /sk-[a-zA-Z0-9]{20,}/g,
      /ghp_[a-zA-Z0-9]{36}/g,
      /gho_[a-zA-Z0-9]{36}/g,
      /ghu_[a-zA-Z0-9]{36}/g,
      /ghs_[a-zA-Z0-9]{36}/g,
      /ghr_[a-zA-Z0-9]{36}/g,
      /Bearer\s+[a-zA-Z0-9_\-]{20,}/gi,
    ];

    let redacted = log;
    for (const pattern of sensitivePatterns) {
      redacted = redacted.replace(pattern, "[REDACTED]");
    }
    return redacted;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private tagInternalLog(message: string): string {
    return `${CallbackClient.INTERNAL_LOG_TAG} ${message}`;
  }

  private isInternalLogMessage(message: string): boolean {
    return message.includes(CallbackClient.INTERNAL_LOG_TAG);
  }
}
