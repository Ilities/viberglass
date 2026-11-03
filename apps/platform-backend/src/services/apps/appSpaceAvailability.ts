import {
  objectStorageBucket,
  objectStorageClientConfig,
  type AppHome,
  type AppSpaceAvailability,
  type AppSpaceRequirement,
} from "@viberglass/types";

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

export function appSpaceAvailability(env: Env, home: AppHome | null): AppSpaceAvailability {
  const missing: AppSpaceRequirement[] = [];
  if (!appsDomain(env)) missing.push("apps_domain");
  if (!hasObjectStorage(env)) missing.push("object_storage");
  if (!home) missing.push("app_home");
  return { available: missing.length === 0, missing };
}
