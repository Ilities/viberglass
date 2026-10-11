import { JOB_FAILURE_CODE } from "@viberglass/types";
import { createChildLogger } from "../config/logger";
import type { JobService } from "../services/JobService";
import type { findActiveKubernetesJobs } from "../services/job/JobSweeperQueries";
import type { WorkerStopperChain } from "./WorkerStopperChain";
import { kubernetesJobName } from "./invokers/kubernetesJob";
import type { KubernetesPodInspector } from "./invokers/KubernetesPodInspector";
import type { WorkerDiagnosticDAO } from "../persistence/job/WorkerDiagnosticDAO";
import {
  kubernetesStatusCode,
  type KubernetesJobClient,
} from "./invokers/kubernetesJobClient";

const logger = createChildLogger({ worker: "KubernetesJobReconciler" });

export class KubernetesJobReconciler {
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly clientFactory: () => Promise<KubernetesJobClient>,
    private readonly findJobs: typeof findActiveKubernetesJobs,
    private readonly jobs: Pick<JobService, "updateJobStatus">,
    private readonly workers: Pick<WorkerStopperChain, "stop">,
    private readonly pods: Pick<KubernetesPodInspector, "inspect">,
    private readonly diagnostics: Pick<WorkerDiagnosticDAO, "record">,
    private readonly gracePeriodMs = 120_000,
  ) {}

  start(): void {
    if (this.interval) return;
    this.sweep().catch((error) => logger.warn("Initial Job reconciliation failed", { error }));
    this.interval = setInterval(() => {
      this.sweep().catch((error) => logger.warn("Job reconciliation failed", { error }));
    }, 60_000);
  }

  stop(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = null;
  }

  async sweep(): Promise<number> {
    const namespace = process.env.KUBERNETES_WORKER_NAMESPACE?.trim();
    if (!namespace) return 0;
    const active = await this.findJobs();
    if (active.length === 0) return 0;
    const client = await this.clientFactory();
    let failed = 0;

    for (const job of active) {
      const olderThanGrace = job.started_at !== null &&
        Date.now() - job.started_at.getTime() >= this.gracePeriodMs;
      let reason: string | undefined;
      let startupFailure: string | undefined;
      let failureCode: string = JOB_FAILURE_CODE.RUN_LOST;
      try {
        const execution = await client.readNamespacedJob({
          namespace,
          name: kubernetesJobName(job.id),
        });
        try {
          const inspection = await this.pods.inspect(namespace, execution);
          startupFailure = inspection.startupFailure;
          await this.diagnostics.record(job.id, "kubernetes", inspection.diagnostics);
          if (olderThanGrace && inspection.startupFailure) {
            reason = inspection.startupFailure;
            failureCode = JOB_FAILURE_CODE.RUNNER_UNAVAILABLE;
          }
        } catch (error) {
          logger.warn("Could not inspect worker Pods", { jobId: job.id, error });
        }
        if (execution.status?.conditions?.some((condition) => condition.type === "Failed" && condition.status === "True")) {
          const condition = execution.status.conditions.find(condition => condition.type === "Failed" && condition.status === "True");
          reason = reason ?? startupFailure ?? `Kubernetes worker Job failed${condition?.reason ? `: ${condition.reason}` : ""}${condition?.message ? `: ${condition.message}` : ""}`;
          if (startupFailure) failureCode = JOB_FAILURE_CODE.RUNNER_UNAVAILABLE;
        } else if ((execution.status?.succeeded ?? 0) > 0 && execution.status?.completionTime &&
          Date.now() - execution.status.completionTime.getTime() >= this.gracePeriodMs) {
          reason = "Kubernetes worker Job finished without a result callback";
        }
      } catch (error) {
        if (kubernetesStatusCode(error) === 404 && olderThanGrace) {
          reason = "Kubernetes worker Job disappeared without a result callback";
        } else if (kubernetesStatusCode(error) !== 404) {
          logger.warn("Could not inspect Kubernetes worker Job", { jobId: job.id, error });
        }
      }

      if (!reason) continue;
      const changed = await this.jobs.updateJobStatus(job.id, "failed", {
        errorMessage: reason,
        failureCode,
        expectedStatus: "active",
      });
      if (changed === false) continue;
      await this.workers.stop(job.id, "Kubernetes Job ended");
      failed++;
    }
    return failed;
  }
}
