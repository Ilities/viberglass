import fs from "fs";
import os from "os";
import { objectStorageBucket, objectStorageClientConfig, type ObjectStorageClientConfig } from "@viberglass/types";
import type { DockerAppHostOptions } from "./DockerAppHost";
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

/** Host firewall rules for apps name this range, so changing it means changing them too. */
export const DEFAULT_APP_NETWORK_POOL = "10.250.0.0/16";

/** How long an app gets to answer its health check after starting. */
export function appHealthTimeoutMs(env: Env): number {
  return positive(env.APPS_HEALTH_TIMEOUT_MS, 120_000);
}

/** Long enough for the app to shut down and Litestream to send its last changes. */
export const APP_STOP_GRACE_SECONDS = 30;
