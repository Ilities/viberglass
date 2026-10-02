import { isObjectRecord } from './clankerConfig'
import type { ModelProviderId } from './modelProviders'

export type SecretLocation = 'env' | 'database' | 'ssm'

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
  createdAt: string
  updatedAt: string
}

/** A secret attached to a runner or task template, and the env var the worker exposes it as. */
export interface SecretBinding {
  envVar: string
  secretId: string
}

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
