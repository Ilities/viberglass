import type { WorkerCapacityStatus } from "@viberglass/types";
import { WorkspaceSettingsDAO } from "../../persistence/workspace/WorkspaceSettingsDAO";
import { kubernetesRunLimiter, type KubernetesRunLimiter } from "./KubernetesRunLimiter";

/** The workspace's limit on Kubernetes workers running at once, and how full it is. */
export class WorkerLimitService {
  constructor(
    private readonly settings: Pick<WorkspaceSettingsDAO, "setWorkerMaxRuns"> = new WorkspaceSettingsDAO(),
    private readonly limiter: Pick<KubernetesRunLimiter, "status" | "setMaxRuns"> = kubernetesRunLimiter,
  ) {}

  status(): WorkerCapacityStatus {
    return this.limiter.status();
  }

  async set(maxRuns: number | null, updatedBy: string | null): Promise<WorkerCapacityStatus> {
    await this.settings.setWorkerMaxRuns(maxRuns, updatedBy);
    this.limiter.setMaxRuns(maxRuns);
    return this.limiter.status();
  }
}
