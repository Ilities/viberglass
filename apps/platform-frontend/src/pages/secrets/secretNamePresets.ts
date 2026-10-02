import { AGENT_OPTIONS, getAgentEnvVarNames, type AgentType } from '@viberglass/types'

export type SecretNamePresetGroup = {
  id: AgentType
  label: string
  helper: string
  names: string[]
}

function describe(apiKey: string[], endpoint: string[]): string {
  const [recommended, ...alternatives] = apiKey
  const parts = [
    recommended ? `Model key: ${recommended}.` : '',
    alternatives.length > 0 ? `Also read: ${alternatives.join(', ')}.` : '',
    endpoint.length > 0 ? `Endpoint override: ${endpoint.join(' or ')}.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}

export const SECRET_NAME_PRESET_GROUPS: SecretNamePresetGroup[] = AGENT_OPTIONS.map((option) => {
  const { apiKey, endpoint } = getAgentEnvVarNames(option.value)
  return {
    id: option.value,
    label: option.label,
    helper: describe(apiKey, endpoint),
    names: [...apiKey, ...endpoint],
  }
})

export const DEFAULT_SECRET_NAME_PRESET_GROUP_ID: AgentType = 'claude-code'
