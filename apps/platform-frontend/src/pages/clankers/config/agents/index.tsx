import type { AgentType, CodexAuthMode } from '@viberglass/types'
import { CodexAgentFields } from './codexFields'

interface AgentSpecificFieldsProps {
  selectedAgent: AgentType | ''
  codexAuthMode: CodexAuthMode
  codexAuthSecretName: string
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
  onCodexAuthSecretNameChange: (secretName: string) => void
}

export function AgentSpecificFields({
  selectedAgent,
  codexAuthMode,
  codexAuthSecretName,
  onCodexAuthModeChange,
  onCodexAuthSecretNameChange,
}: AgentSpecificFieldsProps) {
  if (selectedAgent !== 'codex') {
    return null
  }

  return (
    <CodexAgentFields
      codexAuthMode={codexAuthMode}
      codexAuthSecretName={codexAuthSecretName}
      onCodexAuthModeChange={onCodexAuthModeChange}
      onCodexAuthSecretNameChange={onCodexAuthSecretNameChange}
    />
  )
}
