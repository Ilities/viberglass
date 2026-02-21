import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import type { CodexAuthMode } from '@viberglass/types'
import { toCodexAuthMode } from '../normalizers'

interface CodexAgentFieldsProps {
  codexAuthMode: CodexAuthMode
  codexAuthSecretName: string
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
  onCodexAuthSecretNameChange: (secretName: string) => void
}

export function CodexAgentFields({
  codexAuthMode,
  codexAuthSecretName,
  onCodexAuthModeChange,
  onCodexAuthSecretNameChange,
}: CodexAgentFieldsProps) {
  return (
    <>
      <Field>
        <Label>Codex Auth Mode</Label>
        <Description>Choose between API key auth and ChatGPT device login.</Description>
        <Select value={codexAuthMode} onChange={(value) => onCodexAuthModeChange(toCodexAuthMode(value))}>
          <option value="api_key">API key</option>
          <option value="chatgpt_device">ChatGPT device auth</option>
        </Select>
      </Field>

      {codexAuthMode === 'chatgpt_device' && (
        <Field>
          <Label>Codex Auth Secret Name</Label>
          <Description>Secret used to store and reuse Codex auth.json cache.</Description>
          <Input
            value={codexAuthSecretName}
            onChange={(event) => onCodexAuthSecretNameChange(event.target.value)}
            placeholder="CODEX_AUTH_JSON"
          />
        </Field>
      )}
    </>
  )
}
