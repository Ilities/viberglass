import db from "../config/database";

export interface JobWorker {
  workerType: string;
  executionId: string;
}

/** Which worker runs each job, from when it was started. */
export class JobWorkerDAO {
  async record(jobId: string, worker: JobWorker): Promise<void> {
    await db.updateTable("jobs").set({ worker_type: worker.workerType, worker_execution_id: worker.executionId }).where("id", "=", jobId).execute();
  }

  async get(jobId: string): Promise<JobWorker | null> {
    const row = await db.selectFrom("jobs").select(["worker_type", "worker_execution_id"]).where("id", "=", jobId).executeTakeFirst();
    return row?.worker_type && row.worker_execution_id ? { workerType: row.worker_type, executionId: row.worker_execution_id } : null;
  }
}
