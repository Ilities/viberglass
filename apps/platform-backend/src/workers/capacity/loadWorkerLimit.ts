import { JOB_FAILURE_CODE } from "@viberglass/types";
import type { JobService } from "../../services/JobService";
import type { KubernetesRunLimiter } from "./KubernetesRunLimiter";

/** Loads the worker limit at startup and fails the runs a previous backend left waiting, which nothing will start. */
export async function loadWorkerLimit(
  limiter: Pick<KubernetesRunLimiter, "load">,
  failures: Pick<JobService, "updateJobStatus">,
): Promise<void> {
  for (const jobId of await limiter.load()) {
    await failures.updateJobStatus(jobId, "failed", {
      errorMessage: "Viberglass restarted while this run waited for a free worker. Start it again.",
      failureCode: JOB_FAILURE_CODE.RUNNER_UNAVAILABLE,
      expectedStatus: "queued",
    });
  }
}
