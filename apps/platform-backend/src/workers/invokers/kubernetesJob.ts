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
  callbackSecret: string;
  platformApiUrl: string;
  config: KubernetesStrategyConfig;
  environmentSecret?: string;
  imagePullSecrets?: string[];
  environment?: Record<string, string>;
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
          ...(options.imagePullSecrets?.length ? { imagePullSecrets: options.imagePullSecrets.map(name => ({ name })) } : {}),
          containers: [{
            name: "worker",
            image: options.image,
            command: ["node", "apps/viberator/dist/cli-worker.js", "--job-ref", options.jobId],
            env: [
              { name: "JOB_ID", value: options.jobId },
              { name: "TENANT_ID", value: options.tenantId },
              { name: "PLATFORM_API_URL", value: options.platformApiUrl },
              { name: "CALLBACK_TOKEN_FILE", value: "/run/viberglass-auth/token" },
              ...Object.entries(options.environment ?? {}).map(([name, value]) => ({ name, value })),
              ...(options.environmentSecret ? [{ name: "OTEL_EXPORTER_OTLP_HEADERS", valueFrom: {
                secretKeyRef: { name: options.environmentSecret, key: "OTEL_EXPORTER_OTLP_HEADERS", optional: true },
              } }] : []),
            ],
            volumeMounts: [{ name: "run-auth", mountPath: "/run/viberglass-auth", readOnly: true }],
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
          volumes: [{ name: "run-auth", secret: { secretName: options.callbackSecret, defaultMode: 0o444 } }],
        },
      },
    },
  };
}
