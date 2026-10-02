import { isObjectRecord } from './clankerConfig'
import type { ModelProviderId } from './modelProviders'

export type SecretLocation = 'env' | 'database' | 'ssm'

/** What the platform keeps a secret for, when it manages the secret itself. */
export type SecretPurpose = 'codex_login'

export interface Secret {
  id: string
  /** A label for people; several secrets may share one. Never used as an env var name. */
  name: string
  secretLocation: SecretLocation
  secretPath?: string | null
  /** For `env` secrets: the variable on the Viberglass server that holds the value. */
  sourceEnvVar?: string | null
  /** For model keys: the provider that issued the key. */
  provider?: ModelProviderId | null
  /** Set for secrets the platform manages, such as a runner's ChatGPT login; pickers leave these out. */
  purpose?: SecretPurpose | null
  createdAt: string
  updatedAt: string
}

/** A secret attached to a runner or task template, and the env var the worker exposes it as. */
export interface SecretBinding {
  envVar: string
  secretId: string
}

/** The worker reads a run's repository token from here; it is never passed to the agent. */
export const SCM_TOKEN_ENV_VAR = 'VIBERGLASS_SCM_TOKEN'

/** Env var names: what agent CLIs and the worker read credentials from. */
export const ENV_VAR_NAME_PATTERN = /^[A-Z_][A-Z0-9_]*$/

/** Where new secrets go by default on this instance. */
export interface SecretStorageDefaults {
  /** SSM when agents run on ECS, whose workers read secrets only from SSM. */
  location: 'database' | 'ssm'
  /** New SSM secrets are stored at `<ssmPrefix>/<secret id>`, where ECS and Lambda workers may read them. */
  ssmPrefix: string
}

export interface CreateSecretRequest {
  name: string
  secretLocation: SecretLocation
  secretPath?: string | null
  sourceEnvVar?: string | null
  provider?: ModelProviderId | null
  secretValue?: string
}

export interface UpdateSecretRequest {
  name?: string
  secretLocation?: SecretLocation
  secretPath?: string | null
  sourceEnvVar?: string | null
  provider?: ModelProviderId | null
  secretValue?: string
}

/**
 * A credential a worker needs for a run. Docker workers find it in their environment
 * under `envVar`; ECS and Lambda workers read it from SSM at `ssmPath`.
 */
export interface CredentialRequest {
  envVar: string
  ssmPath?: string | null
  /**
   * Set for secrets a runner or task template binds on purpose: the worker passes them
   * to the agent CLI, still subject to its deny-list. Platform credentials leave it unset.
   */
  exposeToAgent?: boolean
}

/** Reads stored `secret_bindings` JSON, dropping entries that aren't bindings. */
export function parseSecretBindings(value: unknown): SecretBinding[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) return []
  return parsed.flatMap((entry: unknown) => {
    if (!isObjectRecord(entry)) return []
    const { envVar, secretId } = entry
    return typeof envVar === 'string' && typeof secretId === 'string' ? [{ envVar, secretId }] : []
  })
}
