import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Text } from '@/components/text'
import { CheckCircledIcon, CrossCircledIcon } from '@radix-ui/react-icons'
import type { IntegrationManifest, PluginField } from '@viberglass/types'
import { useEffect, useState } from 'react'

type FieldValue = string | number | boolean | string[]

// One object, so the effect that takes new initial values doesn't run on every render.
const NO_VALUES: Record<string, FieldValue> = {}

interface IntegrationConfigFormProps {
  integration: IntegrationManifest
  initialValues?: Record<string, FieldValue>
  /** Keys of the `secret` fields that have a stored value; it is never sent back, so the field stays empty. */
  storedSecrets?: string[]
  onSubmit: (values: Record<string, FieldValue>) => void
  onTest?: (values: Record<string, FieldValue>) => Promise<void>
  isLoading?: boolean
  isTesting?: boolean
  testResult?: { success: boolean; message: string } | null
}

export function IntegrationConfigForm({
  integration,
  initialValues = NO_VALUES,
  storedSecrets = [],
  onSubmit,
  onTest,
  isLoading,
  isTesting,
  testResult,
}: IntegrationConfigFormProps) {
  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues)

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const handleFieldChange = (key: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit(values)
  }

  const handleTest = async () => {
    if (onTest) {
      await onTest(values)
    }
  }

  const renderField = (field: PluginField) => {
    const value = values[field.key] ?? ''

    switch (field.type) {
      case 'string':
        return (
          <Input
            name={field.key}
            value={value as string}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            required={field.required}
          />
        )

      case 'number':
        return (
          <Input
            type="number"
            name={field.key}
            value={value as number}
            onChange={(e) => handleFieldChange(field.key, Number(e.target.value))}
            placeholder={field.placeholder}
            required={field.required}
          />
        )

      case 'boolean':
        return (
          <SwitchField>
            <Switch
              name={field.key}
              checked={Boolean(value)}
              onChange={(checked) => handleFieldChange(field.key, checked)}
            />
            <Label>{field.label}</Label>
          </SwitchField>
        )

      case 'select':
        return (
          <Select
            name={field.key}
            value={(value as string) || '__placeholder__'}
            onChange={(val) => handleFieldChange(field.key, val === '__placeholder__' ? '' : val)}
          >
            <option value="__placeholder__">Select...</option>
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        )

      case 'multiselect':
        return (
          <div className="space-y-2">
            {field.options?.map((option) => (
              <SwitchField key={option.value}>
                <Switch
                  name={`${field.key}[]`}
                  checked={((value as string[]) || []).includes(option.value)}
                  onChange={(checked) => {
                    const currentValues = (value as string[]) || []
                    if (checked) {
                      handleFieldChange(field.key, [...currentValues, option.value])
                    } else {
                      handleFieldChange(
                        field.key,
                        currentValues.filter((v) => v !== option.value)
                      )
                    }
                  }}
                />
                <Label>{option.label}</Label>
              </SwitchField>
            ))}
          </div>
        )

      case 'secret': {
        const stored = storedSecrets.includes(field.key)
        return (
          <Input
            type="password"
            autoComplete="off"
            name={field.key}
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => handleFieldChange(field.key, e.target.value)}
            placeholder={stored ? 'Saved. Enter a new value to replace it.' : field.placeholder}
            required={field.required && !stored}
          />
        )
      }

      default:
        return null
    }
  }

  const dirty = Object.keys({ ...initialValues, ...values }).some((key) => (values[key] ?? '') !== (initialValues[key] ?? ''))

  return (
    <section className="app-frame rounded-lg p-6">
      <Subheading>Settings</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">How Viberglass reaches {integration.label}.</Text>

      <form onSubmit={handleSubmit} className="mt-6 max-w-lg">
        <Fieldset>
          <FieldGroup>
            {integration.configFields.map((field) => (
              <Field key={field.key}>
                <Label>
                  {field.label}
                  {field.required && <span className="ml-1 text-[var(--red-11)]">*</span>}
                </Label>
                {field.description && <Description>{field.description}</Description>}
                {field.type !== 'boolean' ? renderField(field) : <div className="mt-2">{renderField(field)}</div>}
              </Field>
            ))}
          </FieldGroup>
        </Fieldset>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button type="submit" color="brand" disabled={isLoading || !dirty}>
            {isLoading ? 'Saving…' : 'Save'}
          </Button>
          {onTest && (
            <Button type="button" outline onClick={handleTest} disabled={isTesting}>
              {isTesting ? 'Testing…' : 'Test connection'}
            </Button>
          )}
        </div>

        {testResult && !isTesting && (
          <div
            role="status"
            className={`mt-4 flex items-start gap-2 text-sm ${testResult.success ? 'text-[var(--green-11)]' : 'text-[var(--red-11)]'}`}
          >
            {testResult.success ? (
              <CheckCircledIcon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CrossCircledIcon className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{testResult.success ? testResult.message : `Couldn't connect. ${testResult.message}`}</span>
          </div>
        )}
      </form>
    </section>
  )
}
