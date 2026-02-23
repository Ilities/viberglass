import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'

interface GeminiAgentFieldsProps {
  model: string
  onModelChange: (model: string) => void
}

export function GeminiAgentFields({ model, onModelChange }: GeminiAgentFieldsProps) {
  return (
    <Field>
      <Label>Gemini Model</Label>
      <Description>
        Optional model passed as <code>--model</code> to the Gemini CLI for this clanker.
      </Description>
      <Input
        value={model}
        onChange={(event) => onModelChange(event.target.value)}
        placeholder="gemini-2.5-pro"
      />
    </Field>
  )
}
