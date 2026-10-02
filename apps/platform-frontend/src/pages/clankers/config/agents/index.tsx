import type { AgentType, CodexAuthMode } from '@viberglass/types'
import { CodexAgentFields } from './codexFields'
import { OpenCodeAgentFields } from './opencodeFields'
import { QwenAgentFields } from './qwenFields'
import { AntigravityAgentFields } from './antigravityFields'

interface AgentSpecificFieldsProps {
  selectedAgent: AgentType | ''
  strategyName?: string
  codexAuthMode: CodexAuthMode
  qwenEndpoint: string
  opencodeEndpoint: string
  opencodeModel: string
  antigravityModel: string
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
  onQwenEndpointChange: (endpoint: string) => void
  onOpenCodeEndpointChange: (endpoint: string) => void
  onOpenCodeModelChange: (model: string) => void
  onAntigravityModelChange: (model: string) => void
}

export function AgentSpecificFields({
  selectedAgent,
  strategyName,
  codexAuthMode,
  qwenEndpoint,
  opencodeEndpoint,
  opencodeModel,
  antigravityModel,
  onCodexAuthModeChange,
  onQwenEndpointChange,
  onOpenCodeEndpointChange,
  onOpenCodeModelChange,
  onAntigravityModelChange,
}: AgentSpecificFieldsProps) {
  if (selectedAgent === 'codex') {
    return (
      <CodexAgentFields
        strategyName={strategyName}
        codexAuthMode={codexAuthMode}
        onCodexAuthModeChange={onCodexAuthModeChange}
      />
    )
  }

  if (selectedAgent === 'qwen-cli') {
    return <QwenAgentFields endpoint={qwenEndpoint} onEndpointChange={onQwenEndpointChange} />
  }

  if (selectedAgent === 'opencode') {
    return (
      <OpenCodeAgentFields
        endpoint={opencodeEndpoint}
        model={opencodeModel}
        onEndpointChange={onOpenCodeEndpointChange}
        onModelChange={onOpenCodeModelChange}
      />
    )
  }

  if (selectedAgent === 'antigravity') {
    return <AntigravityAgentFields model={antigravityModel} onModelChange={onAntigravityModelChange} />
  }

  return null
}
