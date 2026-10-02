import type { V1Job } from "@kubernetes/client-node";

export interface KubernetesClientPort {
  validateJob(namespace: string, job: V1Job): Promise<void>;
}
