import { randomUUID } from "crypto";
import db from "../../persistence/config/database";
import { createChildLogger } from "../../config/logger";

const logger = createChildLogger({ service: "JobProgressService" });

export interface JobProgressUpdate {
  step?: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface JobLogEntry {
  level: "info" | "warn" | "error" | "debug";
  message: string;
  source?: string;
}

/**
 * Progress and logging operations for jobs.
 * Handles recording progress updates and log lines for job tracking.
 */

/**
 * Record a progress update for a job (also updates heartbeat).
 * Progress updates update the jobs table and store history in job_progress_updates.
 */
export async function recordProgress(
  jobId: string,
  progress: JobProgressUpdate,
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
 * Record a log line for a job.
 * Log lines are stored in job_log_lines table for frontend display.
 */
export async function recordLog(jobId: string, log: JobLogEntry): Promise<void> {
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
 * Record multiple log lines for a job in a single bulk insert.
 * This is much more efficient than individual recordLog calls.
 */
export async function recordLogBatch(
  jobId: string,
  logs: JobLogEntry[],
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
