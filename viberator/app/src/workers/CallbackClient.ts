import axios, { AxiosError } from "axios";
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
  private apiUrl: string;
  private maxRetries: number;
  private retryDelay: number;

  constructor(
    private logger: Logger,
    config: {
      platformUrl?: string;
      maxRetries?: number;
      retryDelay?: number;
    } = {},
  ) {
    this.apiUrl =
      config.platformUrl ||
      process.env.PLATFORM_API_URL ||
      "http://localhost:8888";
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
  }

  async sendResult(
    jobId: string,
    tenantId: string,
    result: CallbackResult,
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/result`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info("Sending job result to platform", {
          jobId,
          attempt: attempt + 1,
        });

        const response = await axios.post(
          url,
          {
            ...result,
            logs: result.logs.map((log) => this.redactSensitiveInfo(log)),
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Tenant-Id": tenantId, // SEC-03: Tenant header
            },
            timeout: 30000, // 30 second timeout
          },
        );

        this.logger.info("Job result sent successfully", {
          jobId,
          status: response.status,
        });

        return; // Success, exit retry loop
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        const delay = this.retryDelay * Math.pow(2, attempt); // Exponential backoff

        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status;
          const isRetryable =
            !statusCode || statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            // Don't retry client errors (4xx)
            this.logger.error("Non-retryable error sending result", {
              jobId,
              statusCode,
              message: error.response?.data?.error || error.message,
            });
            throw new Error(
              `Callback failed: ${error.response?.data?.error || error.message}`,
            );
          }

          if (isLastAttempt) {
            this.logger.error("Max retries exceeded sending job result", {
              jobId,
              lastError: error.message,
            });
            throw new Error(
              `Callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          this.logger.warn("Retryable error, will retry", {
            jobId,
            attempt: attempt + 1,
            statusCode,
            delay,
          });
        } else {
          this.logger.error("Unexpected error sending result", {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        // Wait before retry (exponential backoff)
        if (!isLastAttempt) {
          await this.sleep(delay);
        }
      }
    }
  }

  async sendProgress(
    jobId: string,
    tenantId: string,
    progress: { step?: string; message: string; details?: Record<string, unknown> },
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/progress`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info("Sending job progress to platform", {
          jobId,
          attempt: attempt + 1,
        });

        const response = await axios.post(
          url,
          {
            step: progress.step || null,
            message: this.redactSensitiveInfo(progress.message),
            details: progress.details || null,
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Tenant-Id": tenantId,
            },
            timeout: 10000, // 10 second timeout
          },
        );

        this.logger.info("Job progress sent successfully", {
          jobId,
          status: response.status,
        });

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        const delay = this.retryDelay * Math.pow(2, attempt);

        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status;
          const isRetryable =
            !statusCode || statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            this.logger.error("Non-retryable error sending progress", {
              jobId,
              statusCode,
              message: error.response?.data?.error || error.message,
            });
            throw new Error(
              `Progress callback failed: ${error.response?.data?.error || error.message}`,
            );
          }

          if (isLastAttempt) {
            this.logger.error("Max retries exceeded sending job progress", {
              jobId,
              lastError: error.message,
            });
            throw new Error(
              `Progress callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          this.logger.warn("Retryable error sending progress, will retry", {
            jobId,
            attempt: attempt + 1,
            statusCode,
            delay,
          });
        } else {
          this.logger.error("Unexpected error sending progress", {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        if (!isLastAttempt) {
          await this.sleep(delay);
        }
      }
    }
  }

  async sendLog(
    jobId: string,
    tenantId: string,
    log: { level: "info" | "warn" | "error" | "debug"; message: string; source?: string },
  ): Promise<void> {
    const url = `${this.apiUrl}/api/jobs/${jobId}/logs`;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        this.logger.info("Sending job log to platform", {
          jobId,
          level: log.level,
          attempt: attempt + 1,
        });

        const response = await axios.post(
          url,
          {
            level: log.level,
            message: this.redactSensitiveInfo(log.message),
            source: log.source || null,
          },
          {
            headers: {
              "Content-Type": "application/json",
              "X-Tenant-Id": tenantId,
            },
            timeout: 5000, // 5 second timeout
          },
        );

        this.logger.info("Job log sent successfully", {
          jobId,
          status: response.status,
        });

        return;
      } catch (error) {
        const isLastAttempt = attempt === this.maxRetries;
        const delay = this.retryDelay * Math.pow(2, attempt);

        if (axios.isAxiosError(error)) {
          const statusCode = error.response?.status;
          const isRetryable =
            !statusCode || statusCode >= 500 || statusCode === 429;

          if (!isRetryable) {
            this.logger.error("Non-retryable error sending log", {
              jobId,
              statusCode,
              message: error.response?.data?.error || error.message,
            });
            throw new Error(
              `Log callback failed: ${error.response?.data?.error || error.message}`,
            );
          }

          if (isLastAttempt) {
            this.logger.error("Max retries exceeded sending job log", {
              jobId,
              lastError: error.message,
            });
            throw new Error(
              `Log callback failed after ${this.maxRetries + 1} attempts`,
            );
          }

          this.logger.warn("Retryable error sending log, will retry", {
            jobId,
            attempt: attempt + 1,
            statusCode,
            delay,
          });
        } else {
          this.logger.error("Unexpected error sending log", {
            jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }

        if (!isLastAttempt) {
          await this.sleep(delay);
        }
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
}
