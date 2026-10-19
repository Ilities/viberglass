import type { WorkerStopper } from "./WorkerStopper";
import { DockerWorkerStopper } from "./stoppers/DockerWorkerStopper";
import { EcsWorkerStopper } from "./stoppers/EcsWorkerStopper";
import { KubernetesWorkerStopper } from "./stoppers/KubernetesWorkerStopper";
import { createKubernetesJobClient } from "./invokers/kubernetesJobClient";
import { createKubernetesSecretClient, KubernetesRunSecret } from "./invokers/KubernetesRunSecret";

export function configuredWorkerStoppers(): WorkerStopper[] {
  const stoppers: WorkerStopper[] = [new DockerWorkerStopper(), new EcsWorkerStopper()];
  if (process.env.KUBERNETES_WORKER_NAMESPACE?.trim()) {
    stoppers.push(new KubernetesWorkerStopper(createKubernetesJobClient, new KubernetesRunSecret(createKubernetesSecretClient)));
  }
  return stoppers;
}
