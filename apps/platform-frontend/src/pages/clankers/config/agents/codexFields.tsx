import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { CodexAuthMode } from '@viberglass/types'
import { normalizeStrategyName, toCodexAuthMode } from '../normalizers'
import { DEFAULT_CODEX_AUTH_SECRET_NAME } from '../types'

interface CodexAgentFieldsProps {
  strategyName?: string
  codexAuthMode: CodexAuthMode
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
}

export function CodexAgentFields({
  strategyName,
  codexAuthMode,
  onCodexAuthModeChange,
}: CodexAgentFieldsProps) {
  const isDockerStrategy = strategyName ? normalizeStrategyName(strategyName) === 'docker' : false

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
          <Label>Codex Auth Cache Secret</Label>
          <Description>
            Uses fixed secret name <code>{DEFAULT_CODEX_AUTH_SECRET_NAME}</code> to store and reuse Codex auth.json
            cache.
          </Description>
          {isDockerStrategy && (
            <Description>
              For Docker deployments, ensure the <code>{DEFAULT_CODEX_AUTH_SECRET_NAME}</code> env var is available by
              attaching a secret with that exact name.
            </Description>
          )}
        </Field>
      )}
    </>
  )
}
