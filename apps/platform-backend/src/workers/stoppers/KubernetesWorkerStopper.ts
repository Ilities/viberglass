import type { WorkerStopper } from "../WorkerStopper";
import { kubernetesJobName } from "../invokers/kubernetesJob";
import {
  kubernetesStatusCode,
  type KubernetesJobClient,
} from "../invokers/kubernetesJobClient";
import type { KubernetesRunSecret } from "../invokers/KubernetesRunSecret";

export class KubernetesWorkerStopper implements WorkerStopper {
  readonly name = "KubernetesWorkerStopper";

  constructor(
    private readonly clientFactory: () => Promise<KubernetesJobClient>,
    private readonly secrets: Pick<KubernetesRunSecret, "remove">,
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
      await this.secrets.remove(namespace, jobId);
      return true;
    } catch (error) {
      if (kubernetesStatusCode(error) === 404) {
        await this.secrets.remove(namespace, jobId);
        return false;
      }
      throw error;
    }
  }
}
