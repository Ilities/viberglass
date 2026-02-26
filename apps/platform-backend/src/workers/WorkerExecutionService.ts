import type { Clanker, Project } from "@viberglass/types";
import type { JobData } from "../types/Job";
import { getWorkerInvokerFactory } from "./WorkerInvokerFactory";
import { WorkerError } from "./errors/WorkerError";
import { JobService } from "../services/JobService";
import { createChildLogger } from "../config/logger";

const logger = createChildLogger({ service: "WorkerExecutionService" });

export interface ExecutionConfig {
  maxRetries?: number; // Default: 3
  baseDelayMs?: number; // Default: 1000 (1 second)
  maxDelayMs?: number; // Default: 30000 (30 seconds)
  maxPendingConflictRetries?: number; // Default: 8 (Lambda Pending state)
}

export interface ExecutionResult {
  success: boolean;
  executionId?: string;
  workerType?: string;
  error?: string;
  attempts: number;
}

export class WorkerExecutionService {
  private factory = getWorkerInvokerFactory();
  private jobService = new JobService();
  private config: Required<ExecutionConfig>;

  constructor(config: ExecutionConfig = {}) {
    this.config = {
      maxRetries: config.maxRetries ?? 3,
      baseDelayMs: config.baseDelayMs ?? 1000,
      maxDelayMs: config.maxDelayMs ?? 30000,
      maxPendingConflictRetries: config.maxPendingConflictRetries ?? 8,
    };
  }

  /**
   * Execute a job by invoking the appropriate worker
   * Handles retries for transient errors
   */
  async executeJob(
    job: JobData,
    clanker: Clanker,
    project?: Project,
  ): Promise<ExecutionResult> {
    let lastError: Error | undefined;
    let attempts = 0;
    let pendingConflictExtraRetriesUsed = 0;
    const baseMaxAttempts = this.config.maxRetries + 1;
    const absoluteMaxAttempts =
      baseMaxAttempts + this.config.maxPendingConflictRetries;

    // Mark job as active before invocation
    await this.jobService.updateJobStatus(job.id, "active", {
      progress: {
        message: "Invoking worker",
        timestamp: Date.now(),
      },
    });

    logger.debug("Starting worker invocation", {
      jobId: job.id,
      clankerId: clanker.id,
      maxRetries: this.config.maxRetries,
      maxPendingConflictRetries: this.config.maxPendingConflictRetries,
      baseMaxAttempts,
      absoluteMaxAttempts,
      baseDelayMs: this.config.baseDelayMs,
      maxDelayMs: this.config.maxDelayMs,
      hasProjectContext: Boolean(project),
    });

    while (attempts < absoluteMaxAttempts) {
      attempts++;
      const attemptsRemaining = Math.max(absoluteMaxAttempts - attempts, 0);

      try {
        const invoker = this.factory.getInvokerForClanker(clanker);
        logger.debug("Invoke attempt starting", {
          jobId: job.id,
          attempt: attempts,
          baseMaxAttempts,
          absoluteMaxAttempts,
          attemptsRemaining,
          pendingConflictExtraRetriesUsed,
          invoker: invoker.name,
        });

        const result = await invoker.invoke(job, clanker, project);

        // Success - store execution ID on job
        await this.jobService.updateJobStatus(job.id, "active", {
          progress: {
            message: "Worker invoked successfully",
            executionId: result.executionId,
            workerType: result.workerType,
            timestamp: Date.now(),
          },
        });

        logger.info("Job invoked successfully", {
          jobId: job.id,
          executionId: result.executionId,
          workerType: result.workerType,
          attempts,
          invoker: invoker.name,
        });

        return {
          success: true,
          executionId: result.executionId,
          workerType: result.workerType,
          attempts,
        };
      } catch (error) {
        lastError =
          error instanceof Error
            ? error
            : new Error(this.getErrorMessage(error));

        // Check if error is retryable
        if (error instanceof WorkerError) {
          if (error.isPermanent) {
            // Permanent error - fail immediately
            logger.error("Permanent error, not retrying", {
              jobId: job.id,
              error: error.message,
              attempts,
              absoluteMaxAttempts,
              classification: error.classification,
              causeType: this.getErrorName(error.cause),
            });

            await this.markJobFailed(job.id, error.message);

            return {
              success: false,
              error: error.message,
              attempts,
            };
          }

          // Transient error - retry with backoff
          const isPendingConflict = this.isLambdaPendingConflict(error);
          const canRetryByBaseBudget = attempts <= this.config.maxRetries;
          let canRetryByPendingBudget = false;
          if (isPendingConflict && !canRetryByBaseBudget) {
            canRetryByPendingBudget =
              pendingConflictExtraRetriesUsed <
              this.config.maxPendingConflictRetries;
            if (canRetryByPendingBudget) {
              pendingConflictExtraRetriesUsed++;
            }
          }
          const shouldRetry = canRetryByBaseBudget || canRetryByPendingBudget;

          if (shouldRetry) {
            const backoffDelay = this.calculateBackoff(attempts);
            const delay = Math.max(backoffDelay, error.retryAfterMs ?? 0);
            logger.warn("Transient error, retrying", {
              jobId: job.id,
              error: error.message,
              attempt: attempts,
              baseMaxAttempts,
              absoluteMaxAttempts,
              attemptsRemaining,
              retryBudget: canRetryByPendingBudget ? "pending-conflict" : "base",
              isPendingConflict,
              pendingConflictExtraRetriesUsed,
              maxPendingConflictRetries: this.config.maxPendingConflictRetries,
              classification: error.classification,
              causeType: this.getErrorName(error.cause),
              backoffDelay,
              retryAfterMs: error.retryAfterMs,
              nextRetryIn: delay,
              nextRetryAt: new Date(Date.now() + delay).toISOString(),
            });
            await this.sleep(delay);
            continue;
          }

          logger.error("Transient error retries exhausted", {
            jobId: job.id,
            error: error.message,
            attempt: attempts,
            baseMaxAttempts,
            absoluteMaxAttempts,
            isPendingConflict,
            pendingConflictExtraRetriesUsed,
            maxPendingConflictRetries: this.config.maxPendingConflictRetries,
          });
          break;
        } else {
          // Unknown error type - treat as permanent
          const errorMessage = this.getErrorMessage(error);
          logger.error("Unknown error type", {
            jobId: job.id,
            error: errorMessage,
            errorName: this.getErrorName(error),
            attempts,
            absoluteMaxAttempts,
          });

          await this.markJobFailed(job.id, errorMessage);

          return {
            success: false,
            error: errorMessage,
            attempts,
          };
        }
      }
    }

    // Exhausted retries
    const errorMessage = `Worker invocation failed after ${attempts} attempts: ${lastError?.message}`;
    logger.error("Exhausted retries", {
      jobId: job.id,
      error: errorMessage,
      attempts,
      baseMaxAttempts,
      absoluteMaxAttempts,
      pendingConflictExtraRetriesUsed,
      maxPendingConflictRetries: this.config.maxPendingConflictRetries,
    });

    await this.markJobFailed(job.id, errorMessage);

    return {
      success: false,
      error: errorMessage,
      attempts,
    };
  }

  private calculateBackoff(attempt: number): number {
    // Exponential backoff: baseDelay * 2^(attempt-1)
    const delay = this.config.baseDelayMs * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.maxDelayMs);
  }

  private async markJobFailed(
    jobId: string,
    errorMessage: string,
  ): Promise<void> {
    await this.jobService.updateJobStatus(jobId, "failed", {
      errorMessage,
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    if (typeof error === "string") {
      return error;
    }

    return "Unknown error";
  }

  private getErrorName(error: unknown): string {
    if (!(typeof error === "object" && error !== null)) {
      return typeof error;
    }

    const nameValue = Reflect.get(error, "name");
    return typeof nameValue === "string" ? nameValue : "UnknownError";
  }

  private isLambdaPendingConflict(error: WorkerError): boolean {
    if (!error.isTransient) {
      return false;
    }

    const workerErrorMessage = error.message || "";
    if (!/ResourceConflictException/.test(workerErrorMessage)) {
      return false;
    }

    const causeMessage = this.getErrorMessage(error.cause);
    return /\bPending\b/i.test(workerErrorMessage) || /\bPending\b/i.test(causeMessage);
  }
}
