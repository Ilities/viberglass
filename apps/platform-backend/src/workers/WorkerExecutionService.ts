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

    // Mark job as active before invocation
    await this.jobService.updateJobStatus(job.id, "active", {
      progress: {
        message: "Invoking worker",
        timestamp: Date.now(),
      },
    });

    while (attempts <= this.config.maxRetries) {
      attempts++;

      try {
        const invoker = this.factory.getInvokerForClanker(clanker);
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
        });

        return {
          success: true,
          executionId: result.executionId,
          workerType: result.workerType,
          attempts,
        };
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (error instanceof WorkerError) {
          if (error.isPermanent) {
            // Permanent error - fail immediately
            logger.error("Permanent error, not retrying", {
              jobId: job.id,
              error: error.message,
              attempts,
            });

            await this.markJobFailed(job.id, error.message);

            return {
              success: false,
              error: error.message,
              attempts,
            };
          }

          // Transient error - retry with backoff
          if (attempts <= this.config.maxRetries) {
            const delay = this.calculateBackoff(attempts);
            logger.warn("Transient error, retrying", {
              jobId: job.id,
              error: error.message,
              attempt: attempts,
              nextRetryIn: delay,
            });
            await this.sleep(delay);
            continue;
          }
        } else {
          // Unknown error type - treat as permanent
          logger.error("Unknown error type", {
            jobId: job.id,
            error: (error as Error).message,
            attempts,
          });

          await this.markJobFailed(job.id, (error as Error).message);

          return {
            success: false,
            error: (error as Error).message,
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
}
