import {
  objectStorageBucket,
  objectStorageClientConfig,
  type AppHome,
  type AppSpaceAvailability,
  type AppSpaceRequirement,
} from "@viberglass/types";
import { defaultDeploymentStrategyName } from "../../provisioning/shared/deploymentStrategies";
import { ecsAppHostOptions, kubernetesAppsNamespace } from "./appHostingConfig";

type Env = Record<string, string | undefined>;

/** The wildcard domain apps are served under, such as apps.example.com; null when unset. */
export function appsDomain(env: Env): string | null {
  const domain = env.APPS_DOMAIN?.trim().toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
  return domain || null;
}

function hasObjectStorage(env: Env): boolean {
  if (!objectStorageBucket(env)) return false;
  try {
    objectStorageClientConfig(env);
    return true;
  } catch {
    return false;
  }
}

/** Apps run where workers do; Docker always can, Kubernetes and ECS once the platform set them up. */
function hasAppHost(env: Env): boolean {
  switch (defaultDeploymentStrategyName(env)) {
    case "docker":
      return true;
    case "kubernetes":
      return kubernetesAppsNamespace(env) !== null;
    case "ecs":
      return ecsAppHostOptions(env) !== null;
  }
}

export function appSpaceAvailability(env: Env, home: AppHome | null): AppSpaceAvailability {
  const missing: AppSpaceRequirement[] = [];
  if (!appsDomain(env)) missing.push("apps_domain");
  if (!hasObjectStorage(env)) missing.push("object_storage");
  if (!hasAppHost(env)) missing.push("app_host");
  if (!home) missing.push("app_home");
  return { available: missing.length === 0, missing };
}
