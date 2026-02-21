import { Logger } from "winston";

export interface CallbackResult {
  success: boolean;
  commitHash?: string;
  pullRequestUrl?: string;
  errorMessage?: string;
  logs: string[];
  changedFiles: string[];
  executionTime: number;
  branch?: string;
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

  /**
   * Build common headers for callback requests
   */
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
    const url = `${this.apiUrl}/api/jobs/${jobId}/result`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(
          this.tagInternalLog("Sending job result to platform"),
          {
            jobId,
            attempt: attempt + 1,
          },
        );

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(tenantId),
          body: JSON.stringify({
            ...result,
            logs: result.logs
              .filter((log) => !this.isInternalLogMessage(log))
              .map((log) => this.redactSensitiveInfo(log)),
          }),
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) {
          const statusCode = response.status;
          const isRetryable = statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            const errorData = await response
              .json()
              .catch(() => ({ error: response.statusText }));
            this.logger.error(
              this.tagInternalLog("Non-retryable error sending result"),
              {
                jobId,
                statusCode,
                message: errorData.error || response.statusText,
              },
            );
            throw new Error(
              `Callback failed: ${errorData.error || response.statusText}`,
            );
          }

          if (attempt === this.maxRetries) {
            this.logger.error(
              this.tagInternalLog("Max retries exceeded sending job result"),
              {
                jobId,
                lastStatus: statusCode,
              },
            );
            throw new Error(
              `Callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          const delay = this.retryDelay * Math.pow(2, attempt);
          this.logger.warn(this.tagInternalLog("Retryable error, will retry"), {
            jobId,
            attempt: attempt + 1,
            statusCode,
            delay,
          });
          await this.sleep(delay);
          continue;
        }

        this.logger.info(this.tagInternalLog("Job result sent successfully"), {
          jobId,
          status: response.status,
        });

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;

        if (error instanceof Error && error.name === "AbortError") {
          this.logger.error(this.tagInternalLog("Request timeout"), {
            jobId,
          });
          if (isLastAttempt) {
            throw new Error(
              `Callback timeout after ${this.maxRetries + 1} attempts`,
            );
          }
        } else if (
          error instanceof Error &&
          error.message.startsWith("Callback failed:")
        ) {
          throw error;
        } else {
          this.logger.error(
            this.tagInternalLog("Unexpected error sending result"),
            {
              jobId,
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

  async sendProgress(
    jobId: string,
    tenantId: string,
    progress: {
      step?: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/progress`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(
          this.tagInternalLog("Sending job progress to platform"),
          {
            jobId,
            attempt: attempt + 1,
          },
        );

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(tenantId),
          body: JSON.stringify({
            step: progress.step || null,
            message: this.redactSensitiveInfo(progress.message),
            details: progress.details || null,
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          const statusCode = response.status;
          const isRetryable = statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            const errorData = await response
              .json()
              .catch(() => ({ error: response.statusText }));
            this.logger.error(
              this.tagInternalLog("Non-retryable error sending progress"),
              {
                jobId,
                statusCode,
                message: errorData.error || response.statusText,
              },
            );
            throw new Error(
              `Progress callback failed: ${errorData.error || response.statusText}`,
            );
          }

          if (attempt === this.maxRetries) {
            this.logger.error(
              this.tagInternalLog("Max retries exceeded sending job progress"),
              {
                jobId,
                lastStatus: statusCode,
              },
            );
            throw new Error(
              `Progress callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          const delay = this.retryDelay * Math.pow(2, attempt);
          this.logger.warn(
            this.tagInternalLog("Retryable error sending progress, will retry"),
            {
              jobId,
              attempt: attempt + 1,
              statusCode,
              delay,
            },
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.info(
          this.tagInternalLog("Job progress sent successfully"),
          {
            jobId,
            status: response.status,
          },
        );

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;

        if (error instanceof Error && error.name === "AbortError") {
          this.logger.error(this.tagInternalLog("Request timeout"), {
            jobId,
          });
          if (isLastAttempt) {
            throw new Error(
              `Progress callback timeout after ${this.maxRetries + 1} attempts`,
            );
          }
        } else if (
          error instanceof Error &&
          error.message.startsWith("Progress callback failed:")
        ) {
          throw error;
        } else {
          this.logger.error(
            this.tagInternalLog("Unexpected error sending progress"),
            {
              jobId,
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

  async sendCodexAuthCache(
    jobId: string,
    tenantId: string,
    payload: {
      secretName: string;
      authJson: string;
      updatedAt?: string;
    },
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/codex-auth-cache`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(
          this.tagInternalLog("Sending Codex auth cache to platform"),
          {
            jobId,
            secretName: payload.secretName,
            attempt: attempt + 1,
          },
        );

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(tenantId),
          body: JSON.stringify({
            secretName: payload.secretName,
            authJson: payload.authJson,
            updatedAt: payload.updatedAt || new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          const statusCode = response.status;
          const isRetryable = statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            const errorData = await response
              .json()
              .catch(() => ({ error: response.statusText }));
            throw new Error(
              `Codex auth cache callback failed: ${errorData.error || response.statusText}`,
            );
          }

          if (attempt === this.maxRetries) {
            throw new Error(
              `Codex auth cache callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          const delay = this.retryDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          continue;
        }

        this.logger.info(
          this.tagInternalLog("Codex auth cache sent successfully"),
          {
            jobId,
            status: response.status,
          },
        );

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        if (isLastAttempt) {
          throw error;
        }
        const delay = this.retryDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }
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
    const url = `${this.apiUrl}/api/jobs/${jobId}/logs`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(this.tagInternalLog("Sending job log to platform"), {
          jobId,
          level: log.level,
          attempt: attempt + 1,
        });

        if (this.isInternalLogMessage(log.message)) {
          return;
        }

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(tenantId),
          body: JSON.stringify({
            level: log.level,
            message: this.redactSensitiveInfo(log.message),
            source: log.source || null,
          }),
          signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        if (!response.ok) {
          const statusCode = response.status;
          const isRetryable = statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            const errorData = await response
              .json()
              .catch(() => ({ error: response.statusText }));
            this.logger.error(
              this.tagInternalLog("Non-retryable error sending log"),
              {
                jobId,
                statusCode,
                message: errorData.error || response.statusText,
              },
            );
            throw new Error(
              `Log callback failed: ${errorData.error || response.statusText}`,
            );
          }

          if (attempt === this.maxRetries) {
            this.logger.error(
              this.tagInternalLog("Max retries exceeded sending job log"),
              {
                jobId,
                lastStatus: statusCode,
              },
            );
            throw new Error(
              `Log callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          const delay = this.retryDelay * Math.pow(2, attempt);
          this.logger.warn(
            this.tagInternalLog("Retryable error sending log, will retry"),
            {
              jobId,
              attempt: attempt + 1,
              statusCode,
              delay,
            },
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.info(this.tagInternalLog("Job log sent successfully"), {
          jobId,
          status: response.status,
        });

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;

        if (error instanceof Error && error.name === "AbortError") {
          this.logger.error(this.tagInternalLog("Request timeout"), {
            jobId,
          });
          if (isLastAttempt) {
            throw new Error(
              `Log callback timeout after ${this.maxRetries + 1} attempts`,
            );
          }
        } else if (
          error instanceof Error &&
          error.message.startsWith("Log callback failed:")
        ) {
          throw error;
        } else {
          this.logger.error(
            this.tagInternalLog("Unexpected error sending log"),
            {
              jobId,
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

    const url = `${this.apiUrl}/api/jobs/${jobId}/logs/batch`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info(
          this.tagInternalLog("Sending batch job logs to platform"),
          {
            jobId,
            count: logs.length,
            attempt: attempt + 1,
          },
        );

        const externalLogs = logs.filter(
          (log) => !log.internal && !this.isInternalLogMessage(log.message),
        );
        if (externalLogs.length === 0) {
          return;
        }

        const response = await fetch(url, {
          method: "POST",
          headers: this.buildHeaders(tenantId),
          body: JSON.stringify({
            logs: externalLogs.map((log) => ({
              level: log.level,
              message: this.redactSensitiveInfo(log.message),
              source: log.source || null,
            })),
          }),
          signal: AbortSignal.timeout(10000), // 10 second timeout for batch
        });

        if (!response.ok) {
          const statusCode = response.status;
          const isRetryable = statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            const errorData = await response
              .json()
              .catch(() => ({ error: response.statusText }));
            this.logger.error(
              this.tagInternalLog("Non-retryable error sending batch logs"),
              {
                jobId,
                statusCode,
                message: errorData.error || response.statusText,
              },
            );
            throw new Error(
              `Batch log callback failed: ${errorData.error || response.statusText}`,
            );
          }

          if (attempt === this.maxRetries) {
            this.logger.error(
              this.tagInternalLog("Max retries exceeded sending batch logs"),
              {
                jobId,
                lastStatus: statusCode,
              },
            );
            throw new Error(
              `Batch log callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          const delay = this.retryDelay * Math.pow(2, attempt);
          this.logger.warn(
            this.tagInternalLog(
              "Retryable error sending batch logs, will retry",
            ),
            {
              jobId,
              attempt: attempt + 1,
              statusCode,
              delay,
            },
          );
          await this.sleep(delay);
          continue;
        }

        this.logger.info(
          this.tagInternalLog("Batch job logs sent successfully"),
          {
            jobId,
            count: externalLogs.length,
            status: response.status,
          },
        );

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;

        if (error instanceof Error && error.name === "AbortError") {
          this.logger.error(this.tagInternalLog("Request timeout"), {
            jobId,
          });
          if (isLastAttempt) {
            throw new Error(
              `Batch log callback timeout after ${this.maxRetries + 1} attempts`,
            );
          }
        } else if (
          error instanceof Error &&
          error.message.startsWith("Batch log callback failed:")
        ) {
          throw error;
        } else {
          this.logger.error(
            this.tagInternalLog("Unexpected error sending batch logs"),
            {
              jobId,
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

  // Simple redaction for logs (SEC-04 compliance)
  private redactSensitiveInfo(log: string): string {
    const sensitivePatterns = [
      /token[a-z]*["\s:=]+[a-zA-Z0-9_\-]{20,}/gi,
      /password["\s:=]+[^\s]+/gi,
      /sk-[a-zA-Z0-9]{20,}/g, // API keys
      /ghp_[a-zA-Z0-9]{36}/g, // GitHub tokens
      /gho_[a-zA-Z0-9]{36}/g, // GitHub OAuth tokens
      /ghu_[a-zA-Z0-9]{36}/g, // GitHub user tokens
      /ghs_[a-zA-Z0-9]{36}/g, // GitHub server tokens
      /ghr_[a-zA-Z0-9]{36}/g, // GitHub refresh tokens
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
