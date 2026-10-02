import type { WorkerStopper } from "../WorkerStopper";
import { kubernetesJobName } from "../invokers/kubernetesJob";
import {
  createKubernetesJobClient,
  kubernetesStatusCode,
  type KubernetesJobClient,
} from "../invokers/kubernetesJobClient";

export class KubernetesWorkerStopper implements WorkerStopper {
  readonly name = "KubernetesWorkerStopper";

  constructor(
    private readonly clientFactory: () => Promise<KubernetesJobClient> = createKubernetesJobClient,
  ) {}

  async stop(jobId: string): Promise<boolean> {
    const namespace = process.env.KUBERNETES_WORKER_NAMESPACE?.trim();
    if (!namespace) return false;

    try {
      const client = await this.clientFactory();
      await client.deleteNamespacedJob({
        namespace,
        name: kubernetesJobName(jobId),
        propagationPolicy: "Background",
      });
      return true;
    } catch (error) {
      if (kubernetesStatusCode(error) === 404) return false;
      throw error;
    }
  }
}
