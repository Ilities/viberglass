import { objectStorageBucket, objectStorageClientConfig } from "@viberglass/types";

export function kubernetesEnvironmentError(): string | null {
  if (!process.env.KUBERNETES_WORKER_NAMESPACE?.trim()) return "KUBERNETES_WORKER_NAMESPACE is not configured";
  if (!process.env.PLATFORM_API_URL?.trim()) return "PLATFORM_API_URL is not configured";
  if (!objectStorageBucket(process.env)) return "Kubernetes workers require S3_BUCKET or AWS_S3_BUCKET";
  if (!process.env.KUBERNETES_WORKER_ENV_SECRET?.trim()) return "KUBERNETES_WORKER_ENV_SECRET is not configured";
  try { objectStorageClientConfig(process.env); } catch (error) {
    return error instanceof Error ? error.message : "Object storage configuration is invalid";
  }
  return null;
}
