import type { Secret } from '@/service/api/secret-api'
import {
  AGENT_PROVIDER_BINDINGS,
  ENV_VAR_NAME_PATTERN,
  type AgentType,
  type ModelProviderId,
  type SecretBinding,
} from '@viberglass/types'

/** The env var this agent reads a provider's key from, when it runs that provider. */
function providerEnvVar(agent: AgentType, provider: ModelProviderId): string | undefined {
  return AGENT_PROVIDER_BINDINGS.find((binding) => binding.agent === agent && binding.provider === provider)?.envVar
}

/** A label in env var form: "Notion workspace" becomes NOTION_WORKSPACE. */
function toEnvVarName(label: string): string {
  const name = label
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[0-9]/.test(name) ? `_${name}` : name
}

/**
 * The env var a newly attached secret starts out as: what the agent reads for the key's
 * provider, else the secret's label in env var form.
 */
export function defaultEnvVarForSecret(secret: Secret, agent: AgentType | '' | null | undefined): string {
  const fromProvider = agent && secret.provider ? providerEnvVar(agent, secret.provider) : undefined
  return fromProvider ?? toEnvVarName(secret.name)
}

/** Bindings after the picker's selection changes: kept ones keep their env var, new ones get the default. */
export function applySecretSelection(
  bindings: SecretBinding[],
  selectedIds: string[],
  secrets: Secret[],
  agent: AgentType | '' | null | undefined,
): SecretBinding[] {
  const selected = new Set(selectedIds)
  const kept = bindings.filter((binding) => selected.has(binding.secretId))
  const keptIds = new Set(kept.map((binding) => binding.secretId))
  const added = selectedIds.flatMap((id) => {
    if (keptIds.has(id)) return []
    const secret = secrets.find((candidate) => candidate.id === id)
    return secret ? [{ secretId: id, envVar: defaultEnvVarForSecret(secret, agent) }] : []
  })
  return [...kept, ...added]
}

/** A problem with the bindings that would make saving fail, or null. */
export function describeBindingsProblem(bindings: SecretBinding[]): string | null {
  const invalid = bindings.find((binding) => !ENV_VAR_NAME_PATTERN.test(binding.envVar))
  if (invalid) {
    return `"${invalid.envVar || '(empty)'}" isn't a valid environment variable name. Use capital letters, digits and underscores.`
  }
  const seen = new Set<string>()
  for (const binding of bindings) {
    if (seen.has(binding.envVar)) return `Two secrets are exposed as ${binding.envVar}. Each variable can hold one.`
    seen.add(binding.envVar)
  }
  return null
}
