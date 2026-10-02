import type { AgentType } from '@viberglass/types'
import type { ClankerConfigFormState } from '../types'
import { AntigravityAgentFields } from './antigravityFields'
import { CodexAgentFields } from './codexFields'
import { KimiAgentFields } from './kimiFields'
import { OpenCodeAgentFields } from './opencodeFields'
import { QwenAgentFields } from './qwenFields'

/** The agent settings the runner form edits directly. */
export type AgentSettings = Pick<
  ClankerConfigFormState,
  | 'codexAuthMode'
  | 'codexLoginSecretId'
  | 'qwenEndpoint'
  | 'opencodeEndpoint'
  | 'opencodeModel'
  | 'antigravityModel'
  | 'kimiEndpoint'
  | 'kimiModel'
>

interface AgentSpecificFieldsProps {
  selectedAgent: AgentType | ''
  settings: AgentSettings
  onChange: (changes: Partial<AgentSettings>) => void
}

/** Model and endpoint settings, for the agents that take them. */
export function AgentSpecificFields({ selectedAgent, settings, onChange }: AgentSpecificFieldsProps) {
  if (selectedAgent === 'codex') {
    return (
      <CodexAgentFields
        codexAuthMode={settings.codexAuthMode}
        onCodexAuthModeChange={(codexAuthMode) => onChange({ codexAuthMode })}
      />
    )
  }

  if (selectedAgent === 'qwen-cli') {
    return <QwenAgentFields endpoint={settings.qwenEndpoint} onEndpointChange={(qwenEndpoint) => onChange({ qwenEndpoint })} />
  }

  if (selectedAgent === 'opencode') {
    return (
      <OpenCodeAgentFields
        endpoint={settings.opencodeEndpoint}
        model={settings.opencodeModel}
        onEndpointChange={(opencodeEndpoint) => onChange({ opencodeEndpoint })}
        onModelChange={(opencodeModel) => onChange({ opencodeModel })}
      />
    )
  }

  if (selectedAgent === 'antigravity') {
    return (
      <AntigravityAgentFields
        model={settings.antigravityModel}
        onModelChange={(antigravityModel) => onChange({ antigravityModel })}
      />
    )
  }

  if (selectedAgent === 'kimi-code') {
    return (
      <KimiAgentFields
        endpoint={settings.kimiEndpoint}
        model={settings.kimiModel}
        onEndpointChange={(kimiEndpoint) => onChange({ kimiEndpoint })}
        onModelChange={(kimiModel) => onChange({ kimiModel })}
      />
    )
  }

  return null
}
