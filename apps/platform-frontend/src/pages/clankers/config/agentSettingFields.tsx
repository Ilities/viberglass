import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import type { AgentSettingField } from '@viberglass/types'

// The select can't hold an empty value, so "custom" and "nothing chosen" need values of their own.
const CUSTOM = '__custom__'
const NONE = '__none__'

/** Plain text with `code` spans in backticks. */
function TextWithCode({ text }: { text: string }) {
  return (
    <>
      {text.split('`').map((part, index) => (index % 2 === 1 ? <code key={index}>{part}</code> : part))}
    </>
  )
}

interface SettingInputProps {
  field: AgentSettingField
  value: string
  onChange: (value: string) => void
}

function SettingInput({ field, value, onChange }: SettingInputProps) {
  const input = <Input value={value} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />
  if (field.type === 'string') return input

  const options = field.options ?? []
  const isOption = options.some((option) => option.value === value.trim())
  const custom = !isOption && field.allowCustom === true
  return (
    <>
      <Select
        value={isOption ? value.trim() : custom ? CUSTOM : NONE}
        onChange={(next) => onChange(next === CUSTOM || next === NONE ? '' : next)}
      >
        {!field.allowCustom && <option value={NONE}>Default</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
        {field.allowCustom && <option value={CUSTOM}>Custom</option>}
      </Select>
      {custom && <div className="pt-4">{input}</div>}
    </>
  )
}

interface AgentSettingFieldsProps {
  fields: readonly AgentSettingField[]
  values: Record<string, string>
  onChange: (changes: Record<string, string>) => void
}

/** The settings a harness declares, such as its model or endpoint. */
export function AgentSettingFields({ fields, values, onChange }: AgentSettingFieldsProps) {
  return (
    <>
      {fields.map((field) => (
        <Field key={field.key}>
          <Label>{field.label}</Label>
          {field.description && (
            <Description>
              <TextWithCode text={field.description} />
            </Description>
          )}
          <SettingInput field={field} value={values[field.key] ?? ''} onChange={(value) => onChange({ [field.key]: value })} />
        </Field>
      ))}
    </>
  )
}
