import type { WorkerStopper } from "./WorkerStopper";
import { DockerWorkerStopper } from "./stoppers/DockerWorkerStopper";
import { KubernetesWorkerStopper } from "./stoppers/KubernetesWorkerStopper";

export function configuredWorkerStoppers(): WorkerStopper[] {
  const stoppers: WorkerStopper[] = [new DockerWorkerStopper()];
  if (process.env.KUBERNETES_WORKER_NAMESPACE?.trim()) {
    stoppers.push(new KubernetesWorkerStopper());
  }
  return stoppers;
}
