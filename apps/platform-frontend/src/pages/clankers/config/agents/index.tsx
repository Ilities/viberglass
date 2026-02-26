import type { AgentType, CodexAuthMode } from '@viberglass/types'
import { CodexAgentFields } from './codexFields'
import { OpenCodeAgentFields } from './opencodeFields'
import { QwenAgentFields } from './qwenFields'
import { GeminiAgentFields } from './geminiFields'

interface AgentSpecificFieldsProps {
  selectedAgent: AgentType | ''
  strategyName?: string
  codexAuthMode: CodexAuthMode
  qwenEndpoint: string
  opencodeEndpoint: string
  opencodeModel: string
  geminiModel: string
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
  onQwenEndpointChange: (endpoint: string) => void
  onOpenCodeEndpointChange: (endpoint: string) => void
  onOpenCodeModelChange: (model: string) => void
  onGeminiModelChange: (model: string) => void
}

export function AgentSpecificFields({
  selectedAgent,
  strategyName,
  codexAuthMode,
  qwenEndpoint,
  opencodeEndpoint,
  opencodeModel,
  geminiModel,
  onCodexAuthModeChange,
  onQwenEndpointChange,
  onOpenCodeEndpointChange,
  onOpenCodeModelChange,
  onGeminiModelChange,
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

  if (selectedAgent === 'gemini-cli') {
    return <GeminiAgentFields model={geminiModel} onModelChange={onGeminiModelChange} />
  }

  return null
}
