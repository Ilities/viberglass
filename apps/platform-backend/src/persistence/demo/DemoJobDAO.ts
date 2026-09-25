import { randomUUID } from "crypto";
import type { TicketWorkflowPhase } from "@viberglass/types";
import type { JobResult } from "../../types/Job";
import db from "../config/database";

export interface FinishedDemoJob {
  ticketId: string;
  clankerId: string;
  phase: TicketWorkflowPhase;
  repository: string;
  task: string;
  status: "completed" | "failed";
  result: JobResult;
  errorMessage: string | null;
  finishedAt: Date;
}

/**
 * Writes finished runs for the demo workspace. JobService.submitJob would
 * dispatch a worker; demo runs are history only, so they're inserted as done.
 */
export class DemoJobDAO {
  async insertFinished(job: FinishedDemoJob): Promise<string> {
    const id = `job_demo_${randomUUID()}`;
    const startedAt = new Date(job.finishedAt.getTime() - 4 * 60_000);
    await db
      .insertInto("jobs")
      .values({
        id,
        tenant_id: "api-server",
        repository: job.repository,
        task: job.task,
        status: job.status,
        result: JSON.stringify(job.result),
        error_message: job.errorMessage,
        created_at: startedAt,
        started_at: startedAt,
        finished_at: job.finishedAt,
        ticket_id: job.ticketId,
        clanker_id: job.clankerId,
        job_kind: job.phase,
      })
      .execute();
    return id;
  }

  async deleteJobs(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await db.deleteFrom("jobs").where("id", "in", ids).execute();
  }
}
