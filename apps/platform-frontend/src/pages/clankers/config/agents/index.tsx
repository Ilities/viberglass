import type { AgentType, CodexAuthMode } from '@viberglass/types'
import { CodexAgentFields } from './codexFields'

interface AgentSpecificFieldsProps {
  selectedAgent: AgentType | ''
  strategyName?: string
  codexAuthMode: CodexAuthMode
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
}

export function AgentSpecificFields({
  selectedAgent,
  strategyName,
  codexAuthMode,
  onCodexAuthModeChange,
}: AgentSpecificFieldsProps) {
  if (selectedAgent !== 'codex') {
    return null
  }

  return (
    <CodexAgentFields
      strategyName={strategyName}
      codexAuthMode={codexAuthMode}
      onCodexAuthModeChange={onCodexAuthModeChange}
    />
  )
}
