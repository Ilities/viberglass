import type { WorkerStopper } from "./WorkerStopper";
import { DockerWorkerStopper } from "./stoppers/DockerWorkerStopper";
import { KubernetesWorkerStopper } from "./stoppers/KubernetesWorkerStopper";
import { createKubernetesJobClient } from "./invokers/kubernetesJobClient";
import { createKubernetesSecretClient, KubernetesRunSecret } from "./invokers/KubernetesRunSecret";

export function configuredWorkerStoppers(): WorkerStopper[] {
  const stoppers: WorkerStopper[] = [new DockerWorkerStopper()];
  if (process.env.KUBERNETES_WORKER_NAMESPACE?.trim()) {
    stoppers.push(new KubernetesWorkerStopper(createKubernetesJobClient, new KubernetesRunSecret(createKubernetesSecretClient)));
  }
  return stoppers;
}
