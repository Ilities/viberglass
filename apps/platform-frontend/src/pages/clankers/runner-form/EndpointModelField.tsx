import { Button } from '@/components/button'
import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { Secret } from '@/service/api/secret-api'
import type { ModelEndpoint, ModelEndpointSelection } from '@viberglass/types'
import { useState } from 'react'
import { ModelEndpointDialog } from './ModelEndpointDialog'

export function EndpointModelField({
  endpoint,
  selection,
  onChange,
  onSaved,
  secrets,
  formats,
}: {
  endpoint: ModelEndpoint
  selection: ModelEndpointSelection
  onChange: (selection: ModelEndpointSelection) => void
  onSaved: (endpoint: ModelEndpoint) => void
  secrets: Secret[]
  formats: readonly string[]
}) {
  const [editing, setEditing] = useState(false)
  return (
    <Field>
      <div className="flex items-center justify-between">
        <Label>Model</Label>
        <Button type="button" plain onClick={() => setEditing(true)}>
          View endpoint
        </Button>
      </div>
      <Description>
        {endpoint.baseUrl} · {endpoint.apiFormat}
      </Description>
      <Select value={selection.model || 'none'} onChange={(model) => onChange({ ...selection, model })}>
        <option value="none" disabled>
          Choose a model
        </option>
        {endpoint.models.map((model) => (
          <option key={model} value={model}>
            {model}
          </option>
        ))}
      </Select>
      {editing && (
        <ModelEndpointDialog
          open
          initial={endpoint}
          onClose={() => setEditing(false)}
          onSaved={(value) => {
            onSaved(value)
            setEditing(false)
          }}
          secrets={secrets}
          formats={formats}
        />
      )}
    </Field>
  )
}
