import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'

interface AntigravityAgentFieldsProps {
  model: string
  onModelChange: (model: string) => void
}

export function AntigravityAgentFields({ model, onModelChange }: AntigravityAgentFieldsProps) {
  return (
    <Field>
      <Label>Antigravity Model</Label>
      <Description>
        Optional Antigravity model id for this agent. Leave empty for Antigravity's default.
      </Description>
      <Input
        value={model}
        onChange={(event) => onModelChange(event.target.value)}
        placeholder="gemini-3.1-pro-high"
      />
    </Field>
  )
}
