import {
  FILES_RUNS_UNAVAILABLE,
  objectStorageBucket,
  objectStorageClientConfig,
  type ProjectReadinessCheck,
} from "@viberglass/types";

export function filesSpaceReadiness(
  env: Record<string, string | undefined>,
): ProjectReadinessCheck[] {
  let storage: ProjectReadinessCheck;
  if (!objectStorageBucket(env)) {
    storage = {
      key: "storage",
      label: "File storage",
      state: "missing",
      code: "configure_storage",
      summary:
        "File storage is not configured. Ask an administrator to configure it.",
    };
  } else {
    try {
      objectStorageClientConfig(env);
      storage = {
        key: "storage",
        label: "File storage",
        state: "ready",
        summary:
          "File storage is configured; connectivity will be checked when files are saved.",
      };
    } catch {
      storage = {
        key: "storage",
        label: "File storage",
        state: "invalid",
        code: "configure_storage",
        summary:
          "File storage configuration is invalid. Ask an administrator to check it.",
      };
    }
  }
  return [
    storage,
    {
      key: "filesExecution",
      label: "Files execution",
      state: "unavailable",
      summary: FILES_RUNS_UNAVAILABLE,
    },
  ];
}
