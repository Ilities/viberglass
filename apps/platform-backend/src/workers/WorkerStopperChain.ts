import { createChildLogger } from "../config/logger";
import type { WorkerStopper } from "./WorkerStopper";
import { configuredWorkerStoppers } from "./configuredWorkerStoppers";

const logger = createChildLogger({ worker: "WorkerStopperChain" });

/** Asks each stopper in turn to stop a job's worker, until one has. */
export class WorkerStopperChain {
  constructor(private readonly stoppers: WorkerStopper[] = configuredWorkerStoppers()) {}

  /** Best effort: the run is already ended in the database either way. */
  async stop(jobId: string, reason: string): Promise<void> {
    for (const stopper of this.stoppers) {
      try {
        if (await stopper.stop(jobId)) {
          logger.info("Stopped worker", { jobId, reason, stopper: stopper.name });
          return;
        }
      } catch (error) {
        logger.warn("Failed to stop worker", {
          jobId,
          reason,
          stopper: stopper.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}
