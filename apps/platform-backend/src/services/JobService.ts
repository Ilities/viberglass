import { randomBytes } from "crypto";
import db from "../persistence/config/database";
import { JobData, JobResult, JobStatus } from "../types/Job";
import { createChildLogger } from "../config/logger";
import type { FeedbackService } from "../webhooks/FeedbackService";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";
import { TicketLifecycleStatusService } from "./TicketLifecycleStatusService";
import {
  JOB_SERVICE_ERROR_CODE,
  JobServiceError,
} from "./errors/JobServiceError";
import {
  JOB_KIND,
  TICKET_STATUS,
  type TicketLifecycleStatus,
} from "@viberglass/types";
import { describeJobFailure } from "./job/describeJobFailure";
import { TaskActivityRecorder } from "./tasks/TaskActivityRecorder";
import { currentActorId } from "../api/auth/requestActor";

const logger = createChildLogger({ service: "JobService" });

/**
 * Generate a cryptographically secure callback token
 * Returns a 32-byte hex string (64 characters)
 */
function generateCallbackToken(): string {
  return randomBytes(32).toString("hex");
}

export interface SubmitJobOptions {
  ticketId?: string;
  clankerId?: string;
}

export class JobService {
  private feedbackService?: FeedbackService;
  private ticketDAO: TicketDAO;
  private lifecycleStatusService: TicketLifecycleStatusService;
  private readonly activity = new TaskActivityRecorder();

  constructor(feedbackService?: FeedbackService) {
    this.feedbackService = feedbackService;
    this.ticketDAO = new TicketDAO();
    this.lifecycleStatusService = new TicketLifecycleStatusService();
  }
  async submitJob(
    data: JobData,
    options?: SubmitJobOptions,
  ): Promise<{
    jobId: string;
    status: string;
    timestamp: string;
    callbackToken: string;
  }> {
    const jobId = data.id;
    const callbackToken = generateCallbackToken();

    await db
      .insertInto("jobs")
      .values({
        id: jobId,
        tenant_id: data.tenantId,
        repository: data.repository,
        task: data.task,
        branch: data.branch || null,
        base_branch: data.baseBranch || null,
        context: JSON.stringify(data.context || {}),
        settings: JSON.stringify(data.settings || {}),
        status: "queued",
        progress: null,
        ticket_id: options?.ticketId || null,
        clanker_id: options?.clankerId || null,
        callback_token: callbackToken,
        bootstrap_payload: data.bootstrapPayload
          ? JSON.stringify(data.bootstrapPayload)
          : null,
        job_kind: data.jobKind,
        created_at: new Date(),
      })
      .execute();

    if (options?.ticketId) {
      await this.synchronizeTicketStatus(options.ticketId);
      const startedBy = currentActorId();
      await this.activity.record(
        options.ticketId,
        startedBy ? { type: "human", userId: startedBy } : { type: "system" },
        "run_started",
        { jobId, step: data.jobKind },
      );
    }

    logger.info("Job enqueued", {
      jobId,
      repository: data.repository,
      jobKind: data.jobKind,
      tenantId: data.tenantId,
      ticketId: options?.ticketId,
      clankerId: options?.clankerId,
    });

    if (options?.ticketId && data.jobKind === JOB_KIND.EXECUTION) {
      await this.updateTicketAutoFixStatus(options.ticketId, {
        autoFixStatus: "pending",
      });
      await this.lifecycleStatusService.synchronize(options.ticketId);
    }

    return {
      jobId,
      status: "queued",
      timestamp: new Date().toISOString(),
      callbackToken,
    };
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates: {
      progress?: Record<string, unknown>;
      result?: JobResult;
      errorMessage?: string;
      /** Why the run failed, from JOB_FAILURE_CODE; set by whoever saw it fail. */
      failureCode?: string;
      /** What a task turn produced, and whom it mentioned, for the run's Activity and notifications. */
      turn?: { step: string; mentioned: string[] };
    } = {},
  ): Promise<void> {
    const failure =
      status === "failed"
        ? describeJobFailure(updates.failureCode, updates.errorMessage)
        : undefined;
    const result = updates.result
      ? { ...updates.result, ...(failure ? { failure } : {}) }
      : status === "failed" && failure
        ? { success: false, changedFiles: [], executionTime: 0, errorMessage: updates.errorMessage, failure }
        : undefined;
    const updateData: Record<string, unknown> = {
      status,
      ...(updates.progress !== undefined && { progress: updates.progress }),
      ...(result !== undefined && { result }),
      ...(updates.errorMessage !== undefined && {
        error_message: updates.errorMessage,
      }),
    };

    if (status === "active" && !updateData.started_at) {
      updateData.started_at = new Date();
    }

    if (status === "completed" || status === "failed" || status === "cancelled") {
      updateData.finished_at = new Date();
      // Also update heartbeat - result callback proves worker is alive
      updateData.last_heartbeat = new Date();
    }

    await db
      .updateTable("jobs")
      .set(updateData)
      .where("id", "=", jobId)
      .execute();

    logger.info("Job status updated", { jobId, status, ...updates });

    if (status === "active" || status === "completed" || status === "failed") {
      const job = await db
        .selectFrom("jobs")
        .select(["id", "ticket_id", "repository", "status", "job_kind"])
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (job?.ticket_id && status !== "active") {
        await this.activity.record(job.ticket_id, { type: "agent" }, status === "completed" ? "run_finished" : "run_failed", {
          jobId,
          step: job.job_kind,
          ...(updates.turn ?? {}),
          ...(failure ? { reason: failure.title, category: failure.category } : {}),
        });
      }

      if (job?.ticket_id && job.job_kind === JOB_KIND.EXECUTION) {
        const ticketUpdate =
          status === "active"
            ? {
                autoFixStatus: "in_progress" as const,
              }
            : status === "completed"
              ? {
                  autoFixStatus: "completed" as const,
                  status: TICKET_STATUS.IN_REVIEW,
                  pullRequestUrl: updates.result?.pullRequestUrl,
                }
              : {
                  autoFixStatus: "failed" as const,
                };

        await this.updateTicketAutoFixStatus(job.ticket_id, ticketUpdate);
      }

      if (job?.ticket_id) {
        await this.synchronizeTicketStatus(job.ticket_id);
      }

      if (this.feedbackService && job?.ticket_id) {
        if (status === "active") {
          // Emit job-started outbound event asynchronously.
          this.feedbackService
            .postJobStarted({
              id: job.id,
              ticketId: job.ticket_id,
              status: "active",
              repository: job.repository || undefined,
            })
            .catch((error) => {
              logger.error(
                `Failed to post job-started event for job ${jobId} to outbound webhook`,
                {
                  error: error instanceof Error ? error.message : String(error),
                  jobId,
                  ticketId: job.ticket_id,
                },
              );
            });
        }

        if (status === "completed" || status === "failed") {
          // Emit job-ended outbound event asynchronously.
          const outboundResult: JobResult = updates.result ?? {
            success: status === "completed",
            changedFiles: [],
            executionTime: 0,
            errorMessage: updates.errorMessage,
          };

          this.feedbackService
            .postJobEnded(
              {
                id: job.id,
                ticketId: job.ticket_id,
                status,
                result: outboundResult,
                repository: job.repository || undefined,
              },
              outboundResult,
            )
            .catch((error) => {
              logger.error(
                `Failed to post job-ended event for job ${jobId} to outbound webhook`,
                {
                  error: error instanceof Error ? error.message : String(error),
                  jobId,
                  ticketId: job.ticket_id,
                },
              );
            });
        }
      }
    }
  }

  /** Best effort: a ticket status that lags must not fail the run update. */
  private async synchronizeTicketStatus(ticketId: string): Promise<void> {
    try {
      await this.lifecycleStatusService.synchronize(ticketId);
    } catch (error) {
      logger.warn("Failed to synchronize ticket status", {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async updateTicketAutoFixStatus(
    ticketId: string,
    updates: {
      autoFixStatus: "pending" | "in_progress" | "completed" | "failed";
      status?: TicketLifecycleStatus;
      pullRequestUrl?: string;
    },
  ): Promise<void> {
    try {
      await this.ticketDAO.updateTicket(ticketId, {
        status: updates.status,
        autoFixStatus: updates.autoFixStatus,
        ...(updates.pullRequestUrl
          ? { pullRequestUrl: updates.pullRequestUrl }
          : {}),
      });
    } catch (error) {
      logger.warn("Failed to update ticket auto-fix status", {
        ticketId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async deleteJob(jobId: string): Promise<{ message: string; jobId: string }> {
    const result = await db
      .deleteFrom("jobs")
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new JobServiceError(
        JOB_SERVICE_ERROR_CODE.JOB_NOT_FOUND,
        "Job not found",
      );
    }

    logger.info("Job removed", { jobId });

    return { message: "Job removed successfully", jobId };
  }

}
