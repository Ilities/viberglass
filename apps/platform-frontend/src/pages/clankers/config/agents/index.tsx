import type { AgentType, CodexAuthMode } from '@viberglass/types'
import { CodexAgentFields } from './codexFields'
import { QwenAgentFields } from './qwenFields'

interface AgentSpecificFieldsProps {
  selectedAgent: AgentType | ''
  strategyName?: string
  codexAuthMode: CodexAuthMode
  qwenEndpoint: string
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
  onQwenEndpointChange: (endpoint: string) => void
}

export function AgentSpecificFields({
  selectedAgent,
  strategyName,
  codexAuthMode,
  qwenEndpoint,
  onCodexAuthModeChange,
  onQwenEndpointChange,
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

  return null
}
