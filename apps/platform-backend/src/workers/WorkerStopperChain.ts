import { createChildLogger } from "../config/logger";
import { JobWorkerDAO } from "../persistence/job/JobWorkerDAO";
import type { WorkerStopper } from "./WorkerStopper";
import { configuredWorkerStoppers } from "./configuredWorkerStoppers";

const logger = createChildLogger({ worker: "WorkerStopperChain" });

/** Stops a job's worker with the stopper for the kind of worker its invoker started. */
export class WorkerStopperChain {
  constructor(
    private readonly stoppers: WorkerStopper[] = configuredWorkerStoppers(),
    private readonly workers: Pick<JobWorkerDAO, "get"> = new JobWorkerDAO(),
  ) {}

  /** Best effort: the run is already ended in the database either way. */
  async stop(jobId: string, reason: string): Promise<void> {
    try {
      const worker = await this.workers.get(jobId);
      // No worker was started for the job, so there's nothing to stop.
      if (!worker) return;
      const stopper = this.stoppers.find((candidate) => candidate.workerType === worker.workerType);
      if (!stopper) {
        logger.info("No way to stop this kind of worker; it ends on its own", { jobId, reason, workerType: worker.workerType });
        return;
      }
      if (await stopper.stop(jobId, worker)) logger.info("Stopped worker", { jobId, reason, stopper: stopper.name });
    } catch (error) {
      logger.warn("Failed to stop worker", { jobId, reason, error: error instanceof Error ? error.message : String(error) });
    }
  }
}
