import type { AppHostTarget } from "@viberglass/types";
import { secretsSsmPrefix, setupSecretLocation } from "../secretStorageDefaults";

export interface AppSettingSecretStorage {
  secretLocation: "database" | "ssm";
  /** Unset: the secret store's own place for it. */
  secretPath?: string;
}

/**
 * Where a secret setting is kept. Apps on ECS read theirs from SSM themselves,
 * under one prefix the apps' execution role may read; elsewhere the backend
 * reads it, from wherever new secrets go.
 */
export function appSettingSecretStorage(target: AppHostTarget | null, projectId: string, name: string, env: NodeJS.ProcessEnv = process.env): AppSettingSecretStorage {
  if (target === "ecs") return { secretLocation: "ssm", secretPath: `${secretsSsmPrefix(env)}/apps/${projectId}/${name}` };
  return { secretLocation: setupSecretLocation(env) };
}
