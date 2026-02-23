import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'

const CUSTOM_ENDPOINT_VALUE = '__custom__'
const DEFAULT_ENDPOINT_VALUE = ''

interface QwenEndpointOption {
  value: string
  label: string
  hint?: string
}

const QWEN_ENDPOINT_OPTIONS: QwenEndpointOption[] = [
  {
    value: DEFAULT_ENDPOINT_VALUE,
    label: 'Default (Mainland China)',
    hint: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  {
    value: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    label: 'International (Singapore)',
  },
  {
    value: 'https://dashscope-us.aliyuncs.com/compatible-mode/v1',
    label: 'US (Virginia)',
  },
  {
    value: 'https://coding.dashscope.aliyuncs.com/v1',
    label: 'Coding Plan',
  },
]

interface QwenAgentFieldsProps {
  endpoint: string
  onEndpointChange: (endpoint: string) => void
}

export function QwenAgentFields({ endpoint, onEndpointChange }: QwenAgentFieldsProps) {
  const normalizedEndpoint = endpoint.trim()
  const selectedEndpoint =
    normalizedEndpoint.length === 0 || QWEN_ENDPOINT_OPTIONS.some((option) => option.value === normalizedEndpoint)
      ? normalizedEndpoint
      : CUSTOM_ENDPOINT_VALUE

  return (
    <Field>
      <Label>Qwen API Endpoint</Label>
      <Description>
        Choose the endpoint region for this clanker. This is stored as regular clanker config and injected at runtime.
      </Description>
      <Select
        value={selectedEndpoint}
        onChange={(value) => {
          if (value === CUSTOM_ENDPOINT_VALUE) {
            if (selectedEndpoint !== CUSTOM_ENDPOINT_VALUE) {
              onEndpointChange('')
            }
            return
          }

          onEndpointChange(value)
        }}
      >
        {QWEN_ENDPOINT_OPTIONS.map((option) => (
          <option key={option.value || 'default'} value={option.value}>
            {option.label}
            {option.hint ? ` (${option.hint})` : ''}
          </option>
        ))}
        <option value={CUSTOM_ENDPOINT_VALUE}>Custom endpoint</option>
      </Select>
      {selectedEndpoint === CUSTOM_ENDPOINT_VALUE && (
        <Input
          className="mt-3"
          value={endpoint}
          onChange={(event) => onEndpointChange(event.target.value)}
          placeholder="https://your-endpoint.example.com/compatible-mode/v1"
        />
      )}
      <Description>
        Injected as <code>QWEN_CLI_ENDPOINT</code> and <code>QWEN_API_ENDPOINT</code> to the agent.
      </Description>
    </Field>
  )
}
