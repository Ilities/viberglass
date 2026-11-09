import fs from "fs";
import os from "os";
import { FARGATE_CPU_UNITS, fargateMemoryOptions, objectStorageBucket, objectStorageClientConfig, type ObjectStorageClientConfig } from "@viberglass/types";
import type { DockerAppHostOptions } from "./DockerAppHost";
import type { EcsAppHostOptions } from "./EcsAppHost";
import type { KubernetesAppHostOptions } from "./KubernetesAppHost";
import { AppSubnetPool } from "./AppSubnetPool";

type Env = Record<string, string | undefined>;

/** How an app reaches object storage, which may differ from how the platform does. */
export function appDataStorage(env: Env): { bucket: string; client: ObjectStorageClientConfig } {
  const endpoint = env.APPS_DATA_ENDPOINT?.trim() || env.S3_ENDPOINT;
  return { bucket: objectStorageBucket(env), client: objectStorageClientConfig({ ...env, S3_ENDPOINT: endpoint }) };
}

function positive(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * The platform joins each app's network as its own container, which Docker names
 * after the hostname unless APPS_GATEWAY_CONTAINER says otherwise. Object storage
 * joins when APPS_STORAGE_CONTAINER names its container, under the host name apps
 * use for it. App networks get their subnets from APPS_NETWORK_POOL.
 */
export function dockerAppHostOptions(env: Env): DockerAppHostOptions {
  const storageContainer = env.APPS_STORAGE_CONTAINER?.trim();
  const endpoint = appDataStorage(env).client.endpoint;
  return {
    gatewayContainer: env.APPS_GATEWAY_CONTAINER?.trim() || (fs.existsSync("/.dockerenv") ? os.hostname() : null),
    storage: storageContainer && endpoint ? { container: storageContainer, alias: new URL(endpoint).hostname } : null,
    memoryMb: positive(env.APPS_MEMORY_MB, 512),
    cpus: positive(env.APPS_CPUS, 1),
    subnets: new AppSubnetPool(env.APPS_NETWORK_POOL?.trim() || DEFAULT_APP_NETWORK_POOL),
  };
}

/** The namespace apps run in on Kubernetes; null when apps don't run there. */
export function kubernetesAppsNamespace(env: Env): string | null {
  return env.KUBERNETES_APPS_NAMESPACE?.trim() || null;
}

/** Null when this installation doesn't run apps on Kubernetes. */
export function kubernetesAppHostOptions(env: Env): KubernetesAppHostOptions | null {
  const namespace = kubernetesAppsNamespace(env);
  if (!namespace) return null;
  return {
    namespace,
    storageClass: env.KUBERNETES_APPS_STORAGE_CLASS?.trim() || null,
    imagePullSecrets: (env.KUBERNETES_APPS_IMAGE_PULL_SECRETS ?? "").split(",").map((name) => name.trim()).filter(Boolean),
    memoryMb: positive(env.APPS_MEMORY_MB, 512),
    cpus: positive(env.APPS_CPUS, 1),
    dataSize: env.APPS_DATA_SIZE?.trim() || "1Gi",
    releaseSize: env.APPS_RELEASE_SIZE?.trim() || "1Gi",
  };
}

/** Null when this installation doesn't run apps on ECS; the platform stack sets all of these together. */
export function ecsAppHostOptions(env: Env): EcsAppHostOptions | null {
  const value = (name: string) => env[name]?.trim() || "";
  const cluster = value("ECS_APPS_CLUSTER");
  const subnetIds = value("ECS_APPS_SUBNET_IDS").split(",").map((id) => id.trim()).filter(Boolean);
  const required = [
    cluster,
    value("ECS_APPS_SECURITY_GROUP_ID"),
    value("ECS_APPS_EXECUTION_ROLE_ARN"),
    value("ECS_APPS_LOG_GROUP"),
    value("ECS_APPS_NAMESPACE_ID"),
    value("ECS_APPS_NAMESPACE_NAME"),
    value("ECS_APPS_ROLE_PATH"),
    value("ECS_APPS_PERMISSIONS_BOUNDARY_ARN"),
  ];
  if (required.some((item) => !item) || subnetIds.length === 0) return null;
  return {
    region: value("AWS_REGION") || "eu-west-1",
    prefix: value("ECS_APPS_PREFIX") || "viberglass",
    cluster,
    subnetIds,
    securityGroupId: value("ECS_APPS_SECURITY_GROUP_ID"),
    assignPublicIp: value("ECS_APPS_ASSIGN_PUBLIC_IP") === "true",
    executionRoleArn: value("ECS_APPS_EXECUTION_ROLE_ARN"),
    logGroup: value("ECS_APPS_LOG_GROUP"),
    namespace: { id: value("ECS_APPS_NAMESPACE_ID"), name: value("ECS_APPS_NAMESPACE_NAME") },
    rolePath: value("ECS_APPS_ROLE_PATH"),
    permissionsBoundaryArn: value("ECS_APPS_PERMISSIONS_BOUNDARY_ARN"),
    bucket: objectStorageBucket(env),
    size: fargateSize(positive(env.APPS_CPUS, 0.25), positive(env.APPS_MEMORY_MB, 512)),
  };
}

/** The smallest Fargate size with at least this many vCPUs and MiB, or the largest there is. */
export function fargateSize(cpus: number, memoryMb: number): { cpu: string; memory: string } {
  for (const cpu of FARGATE_CPU_UNITS) {
    if (Number(cpu) < cpus * 1024) continue;
    const memory = fargateMemoryOptions(cpu).find((option) => Number(option) >= memoryMb);
    if (memory) return { cpu, memory };
  }
  const largest = FARGATE_CPU_UNITS[FARGATE_CPU_UNITS.length - 1];
  return { cpu: largest, memory: fargateMemoryOptions(largest).at(-1)! };
}

/** Host firewall rules for apps name this range, so changing it means changing them too. */
export const DEFAULT_APP_NETWORK_POOL = "10.250.0.0/16";

/** How long an app gets to answer its health check after starting. */
export function appHealthTimeoutMs(env: Env): number {
  return positive(env.APPS_HEALTH_TIMEOUT_MS, 120_000);
}

/** Long enough for the app to shut down and Litestream to send its last changes. */
export const APP_STOP_GRACE_SECONDS = 30;

/**
 * How long a live app's storage credentials last. A week on MinIO; AWS caps
 * role sessions at 12 hours or less, so set APPS_DATA_CREDENTIAL_SECONDS there.
 */
export function appDataCredentialSeconds(env: Env): number {
  return positive(env.APPS_DATA_CREDENTIAL_SECONDS, 7 * 24 * 60 * 60);
}

/** The hour (UTC) apps are restarted for new credentials when they can wait for it. */
export function appRestartHour(env: Env): number {
  return hourOfDay(env.APPS_RESTART_HOUR, 3);
}

/** The hour (UTC) every running preview is turned off. */
export function previewOffHour(env: Env): number {
  return hourOfDay(env.APPS_PREVIEW_OFF_HOUR, 3);
}

function hourOfDay(value: string | undefined, fallback: number): number {
  const configured = value?.trim();
  const hour = Number(configured);
  return configured && Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

/** Previews stay on until their change ends, skipping the nightly and idle turn-off. */
export function keepPreviewsOn(env: Env): boolean {
  return env.APPS_KEEP_PREVIEWS_ON?.trim().toLowerCase() === "true";
}

/** How long a preview runs without being opened before it's turned off. */
export function previewIdleMs(env: Env): number {
  return positive(env.APPS_PREVIEW_IDLE_HOURS, 4) * 60 * 60 * 1000;
}
