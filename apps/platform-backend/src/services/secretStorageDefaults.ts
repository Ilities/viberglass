import type { SecretStorageDefaults } from "@viberglass/types";

/** ECS workers read secrets only from SSM, so use SSM when agents run on ECS. */
export function setupSecretLocation(env: NodeJS.ProcessEnv = process.env): "database" | "ssm" {
  return env.VIBERATOR_ECS_CLUSTER_ARN?.trim() ? "ssm" : "database";
}

/** Where SSM secrets live by default. Workers look secrets up here by name. */
export function secretsSsmPrefix(env: NodeJS.ProcessEnv = process.env): string {
  const prefix = env.SECRETS_SSM_PREFIX || "/viberator/secrets";
  return prefix.endsWith("/") ? prefix.slice(0, -1) : prefix;
}

/** Where a new secret goes unless an admin picks otherwise: the same place setup uses. */
export function secretStorageDefaults(env: NodeJS.ProcessEnv = process.env): SecretStorageDefaults {
  return { location: setupSecretLocation(env), ssmPrefix: secretsSsmPrefix(env) };
}
