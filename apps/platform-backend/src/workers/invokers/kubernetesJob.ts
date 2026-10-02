import { createHash } from "crypto";
import type { V1Job } from "@kubernetes/client-node";
import type { KubernetesStrategyConfig } from "@viberglass/types";

export function kubernetesJobName(jobId: string): string {
  return `viberglass-${createHash("sha256").update(jobId).digest("hex").slice(0, 32)}`;
}

export interface KubernetesJobOptions {
  jobId: string;
  tenantId: string;
  image: string;
  callbackToken: string;
  platformApiUrl: string;
  config: KubernetesStrategyConfig;
  environmentSecret?: string;
}

export function buildKubernetesJob(options: KubernetesJobOptions): V1Job {
  const name = kubernetesJobName(options.jobId);
  const labels = {
    "app.kubernetes.io/name": "viberglass-worker",
    "app.kubernetes.io/managed-by": "viberglass",
  };
  return {
    apiVersion: "batch/v1",
    kind: "Job",
    metadata: {
      name,
      labels,
      annotations: { "viberglass.dev/job-id": options.jobId },
    },
    spec: {
      backoffLimit: 0,
      activeDeadlineSeconds: options.config.activeDeadlineSeconds ?? 3600,
      ttlSecondsAfterFinished: 3600,
      template: {
        metadata: { labels },
        spec: {
          restartPolicy: "Never",
          automountServiceAccountToken: false,
          containers: [{
            name: "worker",
            image: options.image,
            command: ["node", "apps/viberator/dist/cli-worker.js", "--job-ref", options.jobId],
            env: [
              { name: "JOB_ID", value: options.jobId },
              { name: "TENANT_ID", value: options.tenantId },
              { name: "PLATFORM_API_URL", value: options.platformApiUrl },
              { name: "CALLBACK_TOKEN", value: options.callbackToken },
            ],
            ...(options.environmentSecret ? { envFrom: [{ secretRef: { name: options.environmentSecret } }] } : {}),
            resources: {
              requests: {
                cpu: options.config.cpu ?? "500m",
                memory: options.config.memory ?? "1Gi",
                "ephemeral-storage": options.config.ephemeralStorage ?? "2Gi",
              },
              limits: {
                cpu: options.config.cpu ?? "500m",
                memory: options.config.memory ?? "1Gi",
                "ephemeral-storage": options.config.ephemeralStorage ?? "2Gi",
              },
            },
          }],
        },
      },
    },
  };
}
