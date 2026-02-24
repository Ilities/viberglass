import type { Secret } from '@/service/api/secret-api'
import { AGENT_LABELS, type AgentType, type CodexAuthMode } from '@viberglass/types'
import { SECRET_NAME_PRESET_GROUPS } from '@/pages/secrets/secretNamePresets'
import { DEFAULT_CODEX_AUTH_SECRET_NAME } from './types'

function isAgentType(value: string): value is AgentType {
  return (
    value === 'claude-code' ||
    value === 'qwen-cli' ||
    value === 'codex' ||
    value === 'opencode' ||
    value === 'kimi-code' ||
    value === 'gemini-cli' ||
    value === 'mistral-vibe'
  )
}

const PRESET_SECRET_NAMES_BY_AGENT = SECRET_NAME_PRESET_GROUPS.reduce<
  Partial<Record<AgentType, string[]>>
>((acc, group) => {
  if (isAgentType(group.id)) {
    acc[group.id] = group.names
  }
  return acc
}, {})

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

  const presetNames = PRESET_SECRET_NAMES_BY_AGENT[selectedAgent] || []
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

export function getSecretPickerDescription(
  selectedAgent: AgentType | '' | null | undefined,
  codexAuthMode: CodexAuthMode,
  showAllSecrets: boolean = false,
): string {
  if (!selectedAgent) {
    return 'Select an agent to see the applicable secrets.'
  }

  const base = `Select which ${AGENT_LABELS[selectedAgent]} secrets should be available to this clanker during execution.`
  const allSecretsNote = showAllSecrets ? ' Showing all configured secrets.' : ''

  if (selectedAgent === 'qwen-cli') {
    return `${base}${allSecretsNote} API endpoint is configured in the Qwen section above and injected automatically.`
  }

  if (selectedAgent === 'opencode') {
    return `${base}${allSecretsNote} Base URL and model can be set in the OpenCode section above.`
  }

  if (selectedAgent === 'gemini-cli') {
    return `${base}${allSecretsNote} Model can be set in the Gemini CLI section above.`
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
