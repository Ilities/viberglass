import type { BatchV1Api } from "@kubernetes/client-node";

export type KubernetesJobClient = Pick<
  BatchV1Api,
  "createNamespacedJob" | "readNamespacedJob" | "deleteNamespacedJob"
>;

export async function createKubernetesJobClient(): Promise<KubernetesJobClient> {
  const { BatchV1Api, KubeConfig } = await import("@kubernetes/client-node");
  const config = new KubeConfig();
  if (process.env.KUBERNETES_SERVICE_HOST) {
    config.loadFromCluster();
  } else {
    config.loadFromDefault();
  }
  return config.makeApiClient(BatchV1Api);
}

export function kubernetesStatusCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if ("code" in error && typeof error.code === "number") return error.code;
  if ("statusCode" in error && typeof error.statusCode === "number") return error.statusCode;
  if ("response" in error && typeof error.response === "object" && error.response !== null && "status" in error.response) {
    return typeof error.response.status === "number" ? error.response.status : undefined;
  }
  return undefined;
}
