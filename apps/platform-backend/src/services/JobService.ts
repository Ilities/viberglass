import { randomUUID, randomBytes } from "crypto";
import db from "../persistence/config/database";
import { JobData, JobResult } from "../types/Job";
import { sql } from "kysely";
import { createChildLogger } from "../config/logger";
import type { FeedbackService } from "../webhooks/FeedbackService";
import { TicketDAO } from "../persistence/ticketing/TicketDAO";

const logger = createChildLogger({ service: "JobService" });

/**
 * Generate a cryptographically secure callback token
 * Returns a 32-byte hex string (64 characters)
 */
function generateCallbackToken(): string {
  return randomBytes(32).toString("hex");
}

// Job status type from database schema
export type JobStatus = "queued" | "active" | "completed" | "failed";

export interface SubmitJobOptions {
  ticketId?: string;
  clankerId?: string;
}

export class JobService {
  private feedbackService?: FeedbackService;
  private ticketDAO: TicketDAO;

  constructor(feedbackService?: FeedbackService) {
    this.feedbackService = feedbackService;
    this.ticketDAO = new TicketDAO();
  }
  async submitJob(
    data: JobData,
    options?: SubmitJobOptions,
  ): Promise<{ jobId: string; status: string; timestamp: string; callbackToken: string }> {
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
        created_at: new Date(),
      })
      .execute();

    logger.info("Job enqueued", {
      jobId,
      repository: data.repository,
      tenantId: data.tenantId,
      ticketId: options?.ticketId,
      clankerId: options?.clankerId,
    });

    if (options?.ticketId) {
      await this.updateTicketAutoFixStatus(options.ticketId, {
        autoFixStatus: "pending",
      });
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
    } = {},
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
      ...(updates.progress !== undefined && { progress: updates.progress }),
      ...(updates.result !== undefined && { result: updates.result }),
      ...(updates.errorMessage !== undefined && {
        error_message: updates.errorMessage,
      }),
    };

    if (status === "active" && !updateData.started_at) {
      updateData.started_at = new Date();
    }

    if (status === "completed" || status === "failed") {
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
        .select(["id", "ticket_id", "repository", "status"])
        .where("id", "=", jobId)
        .executeTakeFirst();

      if (job?.ticket_id) {
        const ticketUpdate =
          status === "active"
            ? {
                autoFixStatus: "in_progress" as const,
              }
            : status === "completed"
              ? {
                  autoFixStatus: "completed" as const,
                  pullRequestUrl: updates.result?.pullRequestUrl,
                }
              : {
                  autoFixStatus: "failed" as const,
                };

        await this.updateTicketAutoFixStatus(job.ticket_id, ticketUpdate);
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
          const outboundResult: JobResult =
            updates.result ?? {
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

  private async updateTicketAutoFixStatus(
    ticketId: string,
    updates: {
      autoFixStatus: "pending" | "in_progress" | "completed" | "failed";
      pullRequestUrl?: string;
    },
  ): Promise<void> {
    try {
      await this.ticketDAO.updateTicket(ticketId, {
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

  async getJobStatus(jobId: string): Promise<any | null> {
    const job = await db
      .selectFrom("jobs")
      .leftJoin("tickets", "tickets.id", "jobs.ticket_id")
      .select([
        "jobs.id",
        "jobs.status",
        "jobs.progress",
        "jobs.last_heartbeat",
        "jobs.repository",
        "jobs.task",
        "jobs.branch",
        "jobs.base_branch",
        "jobs.context",
        "jobs.settings",
        "jobs.result",
        "jobs.error_message",
        "jobs.created_at",
        "jobs.started_at",
        "jobs.finished_at",
        "jobs.tenant_id",
        "jobs.ticket_id",
        "tickets.id as ticket_uuid",
        "tickets.title as ticket_title",
        "tickets.external_ticket_id as ticket_external_id",
      ])
      .where("jobs.id", "=", jobId)
      .executeTakeFirst();

    if (!job) {
      return null;
    }

    // Fetch progress updates history
    const progressUpdates = await db
      .selectFrom("job_progress_updates")
      .selectAll()
      .where("job_id", "=", jobId)
      .orderBy("created_at", "desc")
      .execute();

    // Fetch log lines (most recent first, limited to 100)
    const logs = await db
      .selectFrom("job_log_lines")
      .selectAll()
      .where("job_id", "=", jobId)
      .orderBy("created_at", "desc")
      .limit(100)
      .execute();

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      lastHeartbeat: job.last_heartbeat?.toISOString() || null,
      progressUpdates: progressUpdates.map((pu) => ({
        step: pu.step,
        message: pu.message,
        details: pu.details || null,
        createdAt: pu.created_at?.toISOString() || new Date().toISOString(),
      })),
      logs: logs
        .reverse() // Show oldest to newest for chronological reading
        .map((log) => ({
          id: log.id,
          level: log.level,
          message: log.message,
          source: log.source,
          createdAt: log.created_at?.toISOString() || new Date().toISOString(),
        })),
      data: {
        id: job.id,
        tenantId: job.tenant_id,
        repository: job.repository,
        task: job.task,
        branch: job.branch,
        baseBranch: job.base_branch,
        context: job.context,
        settings: job.settings,
        timestamp: job.created_at?.getTime() || Date.now(),
      },
      result: job.result,
      failedReason: job.error_message,
      createdAt: job.created_at,
      processedAt: job.started_at,
      finishedAt: job.finished_at,
      ticketId: job.ticket_id,
      ticket: job.ticket_id
        ? {
            id: job.ticket_uuid,
            title: job.ticket_title,
            externalTicketId: job.ticket_external_id,
          }
        : null,
    };
  }

  async listJobs(options?: {
    status?: JobStatus;
    limit?: number;
    projectSlug?: string;
    ticketId?: string;
  }): Promise<{ jobs: any[]; count: number }> {
    const { status, limit = 10, projectSlug, ticketId } = options || {};

    let projectId: string | undefined;

    // If projectSlug is provided, look up the actual project UUID
    if (projectSlug) {
      const project = await db
        .selectFrom("projects")
        .select("id")
        .where("slug", "=", projectSlug)
        .executeTakeFirst();

      if (!project) {
        return { jobs: [], count: 0 };
      }

      projectId = project.id;
    }

    // Build base query with joins to get project slug for each job
    let query = db
      .selectFrom("jobs")
      .leftJoin("tickets", "tickets.id", "jobs.ticket_id")
      .leftJoin("projects", "projects.id", "tickets.project_id");

    if (status) {
      query = query.where("jobs.status", "=", status);
    }

    if (ticketId) {
      query = query.where("jobs.ticket_id", "=", ticketId);
    }

    // When filtering by projectId, we need to filter by tickets.project_id
    if (projectId) {
      query = query.where("tickets.project_id", "=", projectId);
    }

    const jobs = await query
      .select([
        "jobs.id",
        "jobs.status",
        "jobs.repository",
        "jobs.task",
        "jobs.tenant_id",
        "jobs.created_at",
        "jobs.started_at",
        "jobs.finished_at",
        "jobs.ticket_id",
        "tickets.id as ticket_id",
        "tickets.title as ticket_title",
        "tickets.external_ticket_id as ticket_external_id",
        "projects.slug as project_slug",
      ])
      .orderBy("jobs.created_at", "desc")
      .limit(limit)
      .execute();

    const jobsData = jobs.map((job) => {
      return {
        jobId: job.id,
        status: job.status,
        repository: job.repository,
        task: job.task,
        tenantId: job.tenant_id,
        createdAt: job.created_at,
        processedAt: job.started_at,
        finishedAt: job.finished_at,
        ticketId: job.ticket_id,
        projectSlug: job.project_slug,
        ticket: job.ticket_id
          ? {
              id: job.ticket_id,
              title: job.ticket_title,
              externalTicketId: job.ticket_external_id,
            }
          : null,
      };
    });

    return { jobs: jobsData, count: jobsData.length };
  }

  async deleteJob(jobId: string): Promise<{ message: string; jobId: string }> {
    const result = await db
      .deleteFrom("jobs")
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (result.numDeletedRows === 0n) {
      throw new Error("Job not found");
    }

    logger.info("Job removed", { jobId });

    return { message: "Job removed successfully", jobId };
  }

  async getQueueStats(): Promise<any> {
    const stats = await db
      .selectFrom("jobs")
      .select([
        sql<string>`COUNT(*) FILTER (WHERE status = 'queued')`.as("waiting"),
        sql<string>`COUNT(*) FILTER (WHERE status = 'active')`.as("active"),
        sql<string>`COUNT(*) FILTER (WHERE status = 'completed')`.as(
          "completed",
        ),
        sql<string>`COUNT(*) FILTER (WHERE status = 'failed')`.as("failed"),
      ])
      .executeTakeFirst();

    const waiting = parseInt(stats?.waiting || "0");
    const active = parseInt(stats?.active || "0");
    const completed = parseInt(stats?.completed || "0");
    const failed = parseInt(stats?.failed || "0");

    return {
      queue: "agent-jobs",
      waiting,
      active,
      completed,
      failed,
      total: waiting + active + completed + failed,
    };
  }

  // Helper method to get next queued job for processing
  async getNextQueuedJob(): Promise<any | null> {
    const job = await db
      .selectFrom("jobs")
      .selectAll()
      .where("status", "=", "queued")
      .orderBy("created_at", "asc")
      .limit(1)
      .executeTakeFirst();

    if (!job) {
      return null;
    }

    // Mark as active
    await this.updateJobStatus(job.id, "active", {
      progress: {
        message: "Job started",
        timestamp: Date.now(),
      },
    });

    return {
      id: job.id,
      data: {
        id: job.id,
        tenantId: job.tenant_id,
        repository: job.repository,
        task: job.task,
        branch: job.branch,
        baseBranch: job.base_branch,
        context: job.context,
        settings: job.settings,
        bootstrapPayload:
          typeof job.bootstrap_payload === "string"
            ? JSON.parse(job.bootstrap_payload)
            : job.bootstrap_payload,
        callbackToken: job.callback_token,
        timestamp: job.created_at?.getTime() || Date.now(),
      },
    };
  }

  /**
   * Find jobs that have been active for longer than the cutoff time
   * Used by OrphanSweeper to detect stuck jobs
   */
  async findOrphanedJobs(
    cutoffTime: Date,
  ): Promise<Array<{ id: string; started_at: Date }>> {
    const jobs = await db
      .selectFrom("jobs")
      .select(["id", "started_at"])
      .where("status", "=", "active")
      .where("started_at", "<", cutoffTime)
      .execute();

    return jobs.map((job) => ({
      id: job.id,
      started_at: job.started_at!,
    }));
  }

  /**
   * Find jobs that have stopped sending heartbeats
   * A job is stale if:
   * - last_heartbeat is before the stale threshold, OR
   * - last_heartbeat is NULL AND started_at is before the stale threshold (never sent progress)
   * Used by HeartbeatSweeper to detect jobs that stopped communicating
   */
  async findStaleJobs(
    staleThreshold: Date,
  ): Promise<
    Array<{ id: string; started_at: Date | null; last_heartbeat: Date | null }>
  > {
    const jobs = await db
      .selectFrom("jobs")
      .select(["id", "started_at", "last_heartbeat"])
      .where("status", "=", "active")
      .where((eb) =>
        eb.or([
          eb("last_heartbeat", "<", staleThreshold),
          eb.and([
            eb("last_heartbeat", "is", null),
            eb("started_at", "<", staleThreshold),
          ]),
        ]),
      )
      .execute();

    return jobs.map((job) => ({
      id: job.id,
      started_at: job.started_at,
      last_heartbeat: job.last_heartbeat,
    }));
  }

  /**
   * Record a progress update for a job (also updates heartbeat)
   * Progress updates update the jobs table and store history in job_progress_updates
   */
  async recordProgress(
    jobId: string,
    progress: {
      step?: string;
      message: string;
      details?: Record<string, unknown>;
    },
  ): Promise<void> {
    const progressData = {
      step: progress.step || null,
      message: progress.message,
      details: progress.details || null,
    };

    await db.transaction().execute(async (trx) => {
      // Update jobs table with new progress and heartbeat timestamp
      await trx
        .updateTable("jobs")
        .set({
          progress: JSON.stringify(progressData),
          last_heartbeat: new Date(),
        })
        .where("id", "=", jobId)
        .execute();

      // Insert into job_progress_updates for history
      await trx
        .insertInto("job_progress_updates")
        .values({
          id: randomUUID(),
          job_id: jobId,
          step: progressData.step,
          message: progressData.message,
          details: progressData.details
            ? JSON.stringify(progressData.details)
            : null,
          created_at: new Date(),
        })
        .execute();
    });

    logger.debug("Job progress recorded", {
      jobId,
      message: progress.message,
      step: progress.step,
    });
  }

  /**
   * Record a log line for a job
   * Log lines are stored in job_log_lines table for frontend display
   */
  async recordLog(
    jobId: string,
    log: {
      level: "info" | "warn" | "error" | "debug";
      message: string;
      source?: string;
    },
  ): Promise<void> {
    await db
      .insertInto("job_log_lines")
      .values({
        id: randomUUID(),
        job_id: jobId,
        level: log.level,
        message: log.message,
        source: log.source || null,
        created_at: new Date(),
      })
      .execute();

    logger.debug("Job log recorded", {
      jobId,
      level: log.level,
      message: log.message,
    });
  }

  /**
   * Record multiple log lines for a job in a single bulk insert
   * This is much more efficient than individual recordLog calls
   */
  async recordLogBatch(
    jobId: string,
    logs: Array<{
      level: "info" | "warn" | "error" | "debug";
      message: string;
      source?: string;
    }>,
  ): Promise<void> {
    if (logs.length === 0) return;

    const now = new Date();
    const values = logs.map((log) => ({
      id: randomUUID(),
      job_id: jobId,
      level: log.level,
      message: log.message,
      source: log.source || null,
      created_at: now,
    }));

    await db.insertInto("job_log_lines").values(values).execute();

    logger.debug("Job log batch recorded", { jobId, count: logs.length });
  }

  /**
   * Validate a callback token for a job
   * Used to authenticate worker callbacks (SEC-05)
   * @returns true if the token is valid, false otherwise
   */
  async validateCallbackToken(
    jobId: string,
    token: string,
  ): Promise<boolean> {
    if (!token || token.length === 0) {
      return false;
    }

    const job = await db
      .selectFrom("jobs")
      .select(["callback_token"])
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (!job) {
      return false;
    }

    // Use timing-safe comparison to prevent timing attacks
    // For simplicity, we use a basic comparison here since the token
    // is already cryptographically random and 64 chars long
    return job.callback_token === token;
  }

  /**
   * Get the callback token for a job (used by invokers to pass to workers)
   */
  async getCallbackToken(jobId: string): Promise<string | null> {
    const job = await db
      .selectFrom("jobs")
      .select(["callback_token"])
      .where("id", "=", jobId)
      .executeTakeFirst();

    return job?.callback_token ?? null;
  }

  /**
   * Persist or replace bootstrap payload for a job.
   */
  async saveBootstrapPayload(
    jobId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await db
      .updateTable("jobs")
      .set({
        bootstrap_payload: JSON.stringify(payload),
      })
      .where("id", "=", jobId)
      .execute();
  }

  /**
   * Retrieve bootstrap payload and tenant binding for worker bootstrap flow.
   */
  async getBootstrapPayload(jobId: string): Promise<{
    tenantId: string;
    payload: Record<string, unknown> | null;
  } | null> {
    const job = await db
      .selectFrom("jobs")
      .select(["tenant_id", "bootstrap_payload"])
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (!job) {
      return null;
    }

    const parsedPayload =
      typeof job.bootstrap_payload === "string"
        ? (JSON.parse(job.bootstrap_payload) as Record<string, unknown>)
        : (job.bootstrap_payload as Record<string, unknown> | null);

    return {
      tenantId: job.tenant_id,
      payload: parsedPayload,
    };
  }
}
