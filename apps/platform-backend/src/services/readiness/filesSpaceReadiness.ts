import {
  objectStorageBucket,
  objectStorageClientConfig,
  type ProjectReadinessCheck,
} from "@viberglass/types";

/** A Files space saves its files in object storage, so runs need it configured. */
export function filesSpaceReadiness(
  env: Record<string, string | undefined>,
): ProjectReadinessCheck[] {
  if (!objectStorageBucket(env)) {
    return [{
      key: "storage",
      label: "File storage",
      state: "missing",
      code: "configure_storage",
      summary:
        "File storage is not configured. Ask an administrator to configure it.",
    }];
  }
  try {
    objectStorageClientConfig(env);
    return [{
      key: "storage",
      label: "File storage",
      state: "ready",
      summary:
        "File storage is configured; connectivity is checked when files are saved.",
    }];
  } catch {
    return [{
      key: "storage",
      label: "File storage",
      state: "invalid",
      code: "configure_storage",
      summary:
        "File storage configuration is invalid. Ask an administrator to check it.",
    }];
  }
}
