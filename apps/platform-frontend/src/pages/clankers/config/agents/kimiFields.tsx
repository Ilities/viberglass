import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'

interface KimiAgentFieldsProps {
  endpoint: string
  model: string
  onEndpointChange: (endpoint: string) => void
  onModelChange: (model: string) => void
}

export function KimiAgentFields({ endpoint, model, onEndpointChange, onModelChange }: KimiAgentFieldsProps) {
  return (
    <>
      <Field>
        <Label>Kimi Endpoint</Label>
        <Description>
          Leave empty for Kimi Code. A Moonshot platform key needs Moonshot&apos;s API, e.g.{' '}
          <code>https://api.moonshot.ai/v1</code>.
        </Description>
        <Input
          value={endpoint}
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder="https://api.moonshot.ai/v1"
        />
      </Field>
      <Field>
        <Label>Kimi Model</Label>
        <Description>Optional model id. Leave empty for Kimi Code&apos;s default.</Description>
        <Input value={model} onChange={(event) => onModelChange(event.target.value)} placeholder="kimi-k3" />
      </Field>
    </>
  )
}
