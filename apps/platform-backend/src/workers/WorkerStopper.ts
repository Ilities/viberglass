/**
 * Stops the running worker for a job, if this stopper's backend is running it.
 *
 * @returns true when a running worker was found and stopped, false when this
 * backend has no running worker for the job.
 */
export interface WorkerStopper {
  readonly name: string;
  stop(jobId: string): Promise<boolean>;
}
