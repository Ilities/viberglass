import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { CodexAuthMode } from '@viberglass/types'

interface CodexAgentFieldsProps {
  codexAuthMode: CodexAuthMode
  onCodexAuthModeChange: (mode: CodexAuthMode) => void
}

/** How Codex signs in: an OpenAI API key, or a ChatGPT account connected once and kept signed in. */
export function CodexAgentFields({ codexAuthMode, onCodexAuthModeChange }: CodexAgentFieldsProps) {
  const usesChatGpt = codexAuthMode !== 'api_key'

  return (
    <Field>
      <Label>Sign in with</Label>
      <Description>
        {usesChatGpt
          ? "Save and start the agent, then connect your ChatGPT account from the agent's page. Codex stays signed in from then on."
          : 'An OpenAI API key, chosen below.'}
      </Description>
      <Select
        value={usesChatGpt ? 'chatgpt' : 'api_key'}
        onChange={(value) => onCodexAuthModeChange(value === 'chatgpt' ? 'chatgpt_device_stored' : 'api_key')}
      >
        <option value="api_key">OpenAI API key</option>
        <option value="chatgpt">ChatGPT account</option>
      </Select>
    </Field>
  )
}
