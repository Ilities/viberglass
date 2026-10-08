import type { CoreV1Api, V1Job } from "@kubernetes/client-node";
import { loadKubernetesConfig } from "./kubernetesJobClient";

type PodClient = Pick<CoreV1Api, "listNamespacedPod" | "listNamespacedEvent">;
export async function createKubernetesPodClient(): Promise<PodClient> {
  const { CoreV1Api } = await import("@kubernetes/client-node");
  return (await loadKubernetesConfig()).makeApiClient(CoreV1Api);
}

export interface KubernetesDiagnostic {
  level: "info" | "warn" | "error";
  message: string;
}

export interface KubernetesInspection {
  diagnostics: KubernetesDiagnostic[];
  startupFailure?: string;
}

export class KubernetesPodInspector {
  constructor(private readonly clientFactory: () => Promise<PodClient>) {}

  async inspect(namespace: string, job: V1Job): Promise<KubernetesInspection> {
    const client = await this.clientFactory();
    const pods = await client.listNamespacedPod({ namespace, labelSelector: `job-name=${job.metadata?.name}` });
    const diagnostics: KubernetesDiagnostic[] = [];
    let startupFailure: string | undefined;
    const objects = [job.metadata, ...pods.items.map(pod => pod.metadata)].filter(metadata => metadata?.uid);
    for (const metadata of objects) {
      const events = await client.listNamespacedEvent({ namespace, fieldSelector: `involvedObject.uid=${metadata?.uid}` });
      for (const event of events.items) {
        const message = `${metadata?.name}: ${event.reason ?? event.type}: ${event.message ?? ""}`;
        diagnostics.push({ level: event.type === "Warning" ? "warn" : "info", message });
        if (event.reason === "FailedCreate" && pods.items.length === 0) startupFailure = message;
      }
    }
    for (const pod of pods.items) {
      const name = pod.metadata?.name ?? "worker";
      diagnostics.push({ level: "info", message: `${name}: ${pod.status?.phase ?? "Pending"}` });
      const scheduling = pod.status?.conditions?.find(condition => condition.type === "PodScheduled" && condition.status === "False");
      if (scheduling) startupFailure = `${name}: ${scheduling.reason}: ${scheduling.message ?? "Worker could not be scheduled"}`;
      for (const container of [...(pod.status?.initContainerStatuses ?? []), ...(pod.status?.containerStatuses ?? [])]) {
        const waiting = container.state?.waiting;
        const terminated = container.state?.terminated;
        if (waiting) {
          const message = `${name}/${container.name}: ${waiting.reason}: ${waiting.message ?? ""}`;
          diagnostics.push({ level: "warn", message });
          if (["ErrImagePull", "ImagePullBackOff", "InvalidImageName", "CreateContainerConfigError", "CreateContainerError", "CrashLoopBackOff"].includes(waiting.reason ?? "")) {
            startupFailure = message;
          }
        }
        if (terminated && terminated.exitCode !== 0) {
          const message = `${name}/${container.name}: ${terminated.reason ?? "Worker exited"} (exit ${terminated.exitCode}): ${terminated.message ?? ""}`;
          diagnostics.push({ level: "error", message });
          startupFailure = message;
        }
      }
    }
    return { diagnostics, startupFailure };
  }
}
