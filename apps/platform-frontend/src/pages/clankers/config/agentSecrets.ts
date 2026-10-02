import type { Secret } from '@/service/api/secret-api'
import { AGENT_LABELS, getAgentEnvVarNames, type AgentType, type CodexAuthMode } from '@viberglass/types'
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
  return secrets.filter((secret) => allowed.has(normalizeSecretName(secret.name)))
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

  const names = getApplicableSecretNames(selectedAgent, codexAuthMode)
  if (names.length === 0) {
    return 'No secrets available.'
  }

  const suggestedNames = names.slice(0, 4).join(', ')
  const remaining = names.length > 4 ? ` (+${names.length - 4} more)` : ''
  return `No matching secrets found for this agent. Create one with name like ${suggestedNames}${remaining}, or enable "Show all secrets" to see other configured secrets.`
}
