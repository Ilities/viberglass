import type { JobWorker } from "../persistence/job/JobWorkerDAO";

/** Stops a job's running worker on the one kind of worker it handles. */
export interface WorkerStopper {
  readonly name: string;
  /** The `workerType` its invoker records for a job, e.g. "docker". */
  readonly workerType: string;
  /**
   * @returns true when a running worker was found and stopped, false when it
   * had already gone.
   */
  stop(jobId: string, worker: JobWorker): Promise<boolean>;
}
