/** Stops the run a session's current turn is executing in. */
export interface SessionJobStopper {
  stopJob(jobId: string): Promise<unknown>;
}
