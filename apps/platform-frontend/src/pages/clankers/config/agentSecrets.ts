import type { Secret } from '@/service/api/secret-api'
import {
  AGENT_LABELS,
  AGENT_PROVIDER_BINDINGS,
  ENV_VAR_NAME_PATTERN,
  getAgentEnvVarNames,
  getModelProvider,
  type AgentType,
  type CodexAuthMode,
  type ModelProviderId,
  type SecretBinding,
} from '@viberglass/types'
import { DEFAULT_CODEX_AUTH_SECRET_NAME } from './types'

/**
 * Get all configured secrets without filtering by agent presets.
 * Used when "show all secrets" option is enabled.
 */
export function getAllSecrets(secrets: Secret[]): Secret[] {
  return secrets
}

function normalizeSecretName(value: string): string {
  return value.trim().toUpperCase()
}

function getCodexExtraSecretNames(codexAuthMode: CodexAuthMode): string[] {
  if (codexAuthMode === 'chatgpt_device' || codexAuthMode === 'chatgpt_device_stored') {
    return [DEFAULT_CODEX_AUTH_SECRET_NAME]
  }
  return []
}

export function getApplicableSecretNames(
  selectedAgent: AgentType | '' | null | undefined,
  codexAuthMode: CodexAuthMode,
): string[] {
  if (!selectedAgent) {
    return []
  }

  const { apiKey, endpoint } = getAgentEnvVarNames(selectedAgent)
  const presetNames = [...apiKey, ...endpoint]
  const codexNames = selectedAgent === 'codex' ? getCodexExtraSecretNames(codexAuthMode) : []

  const deduped = new Map<string, string>()
  for (const name of [...presetNames, ...codexNames]) {
    const normalized = normalizeSecretName(name)
    if (!deduped.has(normalized)) {
      deduped.set(normalized, name)
    }
  }

  return Array.from(deduped.values())
}

export function filterSecretsForAgent(
  secrets: Secret[],
  selectedAgent: AgentType | '' | null | undefined,
  codexAuthMode: CodexAuthMode,
): Secret[] {
  const names = getApplicableSecretNames(selectedAgent, codexAuthMode)
  if (names.length === 0) {
    return []
  }

  const allowed = new Set(names.map(normalizeSecretName))
  return secrets.filter(
    (secret) =>
      (selectedAgent && secret.provider && providerEnvVar(selectedAgent, secret.provider)) ||
      allowed.has(normalizeSecretName(secret.name)),
  )
}

/** The env var this agent reads a provider's key from, when it runs that provider. */
function providerEnvVar(agent: AgentType, provider: ModelProviderId): string | undefined {
  return AGENT_PROVIDER_BINDINGS.find((binding) => binding.agent === agent && binding.provider === provider)?.envVar
}

/**
 * The env var a newly attached secret starts out as: what the agent reads for the key's
 * provider, else the label when it already is an env var name, else the agent's key name.
 */
export function defaultEnvVarForSecret(secret: Secret, agent: AgentType | '' | null | undefined): string {
  const fromProvider = agent && secret.provider ? providerEnvVar(agent, secret.provider) : undefined
  if (fromProvider) return fromProvider
  if (ENV_VAR_NAME_PATTERN.test(secret.name)) return secret.name
  return agent ? (getAgentEnvVarNames(agent).apiKey[0] ?? '') : ''
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

export interface SecretPickerOption {
  id: string
  label: string
  description: string
}

function describeLocation(secret: Secret): string {
  return `${secret.secretLocation}${secret.secretPath ? ` - ${secret.secretPath}` : ''}`
}

/**
 * The selectable secrets, followed by any selected secret outside them. Changing the
 * agent or the filter never drops a selection; the user sees it flagged and decides.
 */
export function buildSecretPickerOptions(
  secrets: Secret[],
  selectable: Secret[],
  selectedIds: string[],
  selectedAgent: AgentType | '' | null | undefined,
): SecretPickerOption[] {
  const selectableIds = new Set(selectable.map((secret) => secret.id))
  const selected = new Set(selectedIds)
  const notReadNote = selectedAgent ? ` · not read by ${AGENT_LABELS[selectedAgent]}` : ''
  return [
    ...selectable.map((secret) => ({ id: secret.id, label: secret.name, description: describeLocation(secret) })),
    ...secrets
      .filter((secret) => selected.has(secret.id) && !selectableIds.has(secret.id))
      .map((secret) => ({ id: secret.id, label: secret.name, description: `${describeLocation(secret)}${notReadNote}` })),
  ]
}

export function getSecretPickerDescription(
  selectedAgent: AgentType | '' | null | undefined,
  codexAuthMode: CodexAuthMode,
  showAllSecrets: boolean = false,
): string {
  if (!selectedAgent) {
    return 'Select an agent to see the applicable secrets.'
  }

  const base = `Select which ${AGENT_LABELS[selectedAgent]} secrets should be available to this agent runner during execution.`
  const allSecretsNote = showAllSecrets ? ' Showing all configured secrets.' : ''

  if (selectedAgent === 'qwen-cli') {
    return `${base}${allSecretsNote} API endpoint is configured in the Qwen section above and injected automatically.`
  }

  if (selectedAgent === 'opencode') {
    return `${base}${allSecretsNote} Base URL and model can be set in the OpenCode section above.`
  }

  if (selectedAgent === 'antigravity') {
    return `${base}${allSecretsNote} Model can be set in the Google Antigravity section above.`
  }

  if (
    selectedAgent === 'codex' &&
    (codexAuthMode === 'chatgpt_device' || codexAuthMode === 'chatgpt_device_stored')
  ) {
    return `${base}${allSecretsNote} Include CODEX_AUTH_JSON when using ChatGPT device auth mode.`
  }

  return `${base}${allSecretsNote}`
}

export function getSecretPickerEmptyMessage(
  selectedAgent: AgentType | '' | null | undefined,
  codexAuthMode: CodexAuthMode,
  showAllSecrets: boolean = false,
): string {
  if (showAllSecrets) {
    return 'No secrets configured. Add secrets in the Secrets page to make them available here.'
  }

  if (!selectedAgent) {
    return 'No secrets available.'
  }

  const providers = AGENT_PROVIDER_BINDINGS.filter((binding) => binding.agent === selectedAgent).map(
    (binding) => getModelProvider(binding.provider).displayName,
  )
  const from = providers.length > 0 ? ` with "Model key from" set to ${providers.join(' or ')}` : ''
  return `No model key for ${AGENT_LABELS[selectedAgent]} yet. Add one on the Secrets page${from}, or enable "Show all secrets" to see other configured secrets.`
}
