import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'

interface OpenCodeAgentFieldsProps {
  endpoint: string
  model: string
  onEndpointChange: (endpoint: string) => void
  onModelChange: (model: string) => void
}

export function OpenCodeAgentFields({ endpoint, model, onEndpointChange, onModelChange }: OpenCodeAgentFieldsProps) {
  return (
    <>
      <Field>
        <Label>OpenCode Base URL</Label>
        <Description>
          Optional OpenAI-compatible endpoint override for this clanker. If blank, OpenCode uses its default provider
          endpoint. This is usually not needed, OpenCode directs the requests to the correct endpoints automatically,
          based on model configuration.
        </Description>
        <Input
          value={endpoint}
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder="https://api.openai.com/v1"
        />
      </Field>

      <Field>
        <Label>OpenCode Model</Label>
        <Description>
          Optional model passed as <code>--model</code> to the OpenCode CLI for this clanker. Use `opencode models` to
          list available models.
        </Description>
        <Input value={model} onChange={(event) => onModelChange(event.target.value)} placeholder="gpt-5-codex" />
      </Field>
    </>
  )
}
