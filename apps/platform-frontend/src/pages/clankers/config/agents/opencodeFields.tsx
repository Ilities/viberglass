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
          Optional model override for this clanker. Use <code>provider/model</code> format (e.g.,{' '}
          <code>minimax/minimax-2.7</code>). See <code>opencode models</code> to list available models, or configure
          models via JSON config file at <code>~/.config/opencode/opencode.json</code>:
        </Description>
        <Input
          value={model}
          onChange={(event) => onModelChange(event.target.value)}
          placeholder="provider/model-name"
        />
      </Field>
    </>
  )
}
