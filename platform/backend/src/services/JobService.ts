import db from "../persistence/config/database";
import { JobData, JobResult } from "../types/Job";
import { sql } from "kysely";

export class JobService {
  async submitJob(
    data: JobData,
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
        context: JSON.stringify(data.context),
        settings: JSON.stringify(data.settings),
        status: "queued",
        progress: null,
        created_at: new Date(),
      })
      .execute();

    console.log(`[JobService] Job ${jobId} enqueued`, {
      jobId,
      repository: data.repository,
      tenantId: data.tenantId,
    });

    return {
      jobId,
      status: "queued",
      timestamp: new Date().toISOString(),
    };
  }

  async updateJobStatus(
    jobId: string,
    status: "queued" | "active" | "completed" | "failed",
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
    status?: string,
    limit: number = 10,
  ): Promise<{ jobs: any[]; count: number }> {
    let query = db.selectFrom("jobs").selectAll();

    if (status) {
      query = query.where("status", "=", status as any);
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

    if (result.numDeletedRows === 0) {
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
}
