import { randomUUID } from "crypto";
import db from "../persistence/config/database";
import { JobData, JobResult } from "../types/Job";
import { sql } from "kysely";

// Job status type from database schema
export type JobStatus = "queued" | "active" | "completed" | "failed";

export interface SubmitJobOptions {
  ticketId?: string;
  clankerId?: string;
}

export class JobService {
  async submitJob(
    data: JobData,
    options?: SubmitJobOptions,
  ): Promise<{ jobId: string; status: string; timestamp: string }> {
    const jobId = data.id;

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
        created_at: new Date(),
      })
      .execute();

    console.log(`[JobService] Job ${jobId} enqueued`, {
      jobId,
      repository: data.repository,
      tenantId: data.tenantId,
      ticketId: options?.ticketId,
      clankerId: options?.clankerId,
    });

    return {
      jobId,
      status: "queued",
      timestamp: new Date().toISOString(),
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
    }

    await db
      .updateTable("jobs")
      .set(updateData)
      .where("id", "=", jobId)
      .execute();

    console.log(`[JobService] Job ${jobId} updated to ${status}`, updates);
  }

  async getJobStatus(jobId: string): Promise<any | null> {
    const job = await db
      .selectFrom("jobs")
      .selectAll()
      .where("id", "=", jobId)
      .executeTakeFirst();

    if (!job) {
      return null;
    }

    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
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
    };
  }

  async listJobs(
    status?: JobStatus,
    limit: number = 10,
  ): Promise<{ jobs: any[]; count: number }> {
    let query = db.selectFrom("jobs").selectAll();

    if (status) {
      query = query.where("status", "=", status);
    }

    const jobs = await query
      .orderBy("created_at", "desc")
      .limit(limit)
      .execute();

    const jobsData = jobs.map((job) => ({
      jobId: job.id,
      status: job.status,
      repository: job.repository,
      task: job.task,
      tenantId: job.tenant_id,
      createdAt: job.created_at,
      processedAt: job.started_at,
      finishedAt: job.finished_at,
    }));

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

    console.log(`[JobService] Job ${jobId} removed`);

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
        timestamp: job.created_at?.getTime() || Date.now(),
      },
    };
  }

  /**
   * Find jobs that have been active for longer than the cutoff time
   * Used by OrphanSweeper to detect stuck jobs
   */
  async findOrphanedJobs(cutoffTime: Date): Promise<Array<{ id: string; started_at: Date }>> {
    const jobs = await db
      .selectFrom('jobs')
      .select(['id', 'started_at'])
      .where('status', '=', 'active')
      .where('started_at', '<', cutoffTime)
      .execute();

    return jobs.map(job => ({
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
  async findStaleJobs(staleThreshold: Date): Promise<Array<{ id: string; started_at: Date | null; last_heartbeat: Date | null }>> {
    const jobs = await db
      .selectFrom('jobs')
      .select(['id', 'started_at', 'last_heartbeat'])
      .where('status', '=', 'active')
      .where((eb) =>
        eb.or([
          eb('last_heartbeat', '<', staleThreshold),
          eb.and([
            eb('last_heartbeat', 'is', null),
            eb('started_at', '<', staleThreshold),
          ]),
        ])
      )
      .execute();

    return jobs.map(job => ({
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
        .updateTable('jobs')
        .set({
          progress: JSON.stringify(progressData),
          last_heartbeat: new Date(),
        })
        .where('id', '=', jobId)
        .execute();

      // Insert into job_progress_updates for history
      await trx
        .insertInto('job_progress_updates')
        .values({
          id: randomUUID(),
          job_id: jobId,
          step: progressData.step,
          message: progressData.message,
          details: progressData.details ? JSON.stringify(progressData.details) : null,
          created_at: new Date(),
        })
        .execute();
    });

    console.log(`[JobService] Job ${jobId} progress: ${progress.message}`);
  }

  /**
   * Record a log line for a job
   * Log lines are stored in job_log_lines table for frontend display
   */
  async recordLog(
    jobId: string,
    log: {
      level: 'info' | 'warn' | 'error' | 'debug';
      message: string;
      source?: string;
    },
  ): Promise<void> {
    await db
      .insertInto('job_log_lines')
      .values({
        id: randomUUID(),
        job_id: jobId,
        level: log.level,
        message: log.message,
        source: log.source || null,
        created_at: new Date(),
      })
      .execute();

    console.log(`[JobService] Job ${jobId} log: ${log.level} - ${log.message}`);
  }
}
