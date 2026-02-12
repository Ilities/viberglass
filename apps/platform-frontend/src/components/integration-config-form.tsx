import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Text } from '@/components/text'
import type {
  AuthCredentialType,
  IntegrationFieldDefinition,
  IntegrationMetadata,
} from '@viberglass/types'
import { EyeClosedIcon, EyeOpenIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

type FieldValue = string | number | boolean | string[]

const AUTH_FIELD_DEFINITIONS: Record<AuthCredentialType, IntegrationFieldDefinition[]> = {
  api_key: [
    {
      key: 'apiKey',
      label: 'API Key',
      type: 'secret',
      required: true,
      description: 'API key for authenticating requests.',
    },
    {
      key: 'baseUrl',
      label: 'API Base URL',
      type: 'string',
      description: 'Optional base URL for self-hosted instances.',
      placeholder: 'https://api.example.com',
    },
  ],
  token: [
    {
      key: 'token',
      label: 'Access Token',
      type: 'secret',
      required: true,
      description: 'Personal access token or bearer token.',
    },
    {
      key: 'baseUrl',
      label: 'API Base URL',
      type: 'string',
      description: 'Optional base URL for self-hosted instances.',
      placeholder: 'https://api.example.com',
    },
  ],
  basic: [
    {
      key: 'username',
      label: 'Username',
      type: 'string',
      required: true,
      description: 'Username for basic authentication.',
    },
    {
      key: 'password',
      label: 'Password',
      type: 'secret',
      required: true,
      description: 'Password or API token for basic authentication.',
    },
    {
      key: 'baseUrl',
      label: 'API Base URL',
      type: 'string',
      description: 'Optional base URL for self-hosted instances.',
      placeholder: 'https://api.example.com',
    },
  ],
  oauth: [
    {
      key: 'clientId',
      label: 'Client ID',
      type: 'string',
      required: true,
      description: 'OAuth client ID from your integration setup.',
    },
    {
      key: 'clientSecret',
      label: 'Client Secret',
      type: 'secret',
      required: true,
      description: 'OAuth client secret from your integration setup.',
    },
    {
      key: 'refreshToken',
      label: 'Refresh Token',
      type: 'secret',
      description: 'Optional refresh token for OAuth flows.',
    },
    {
      key: 'baseUrl',
      label: 'API Base URL',
      type: 'string',
      description: 'Optional base URL for self-hosted instances.',
      placeholder: 'https://api.example.com',
    },
  ],
}

interface IntegrationConfigFormProps {
  integration: IntegrationMetadata
  initialValues?: Record<string, FieldValue>
  initialAuthType?: AuthCredentialType
  onSubmit: (values: { authType: AuthCredentialType; values: Record<string, FieldValue> }) => void
  onTest?: (values: { authType: AuthCredentialType; values: Record<string, FieldValue> }) => Promise<void>
  onCancel: () => void
  isLoading?: boolean
  isTesting?: boolean
  testResult?: { success: boolean; message: string } | null
}

export function IntegrationConfigForm({
  integration,
  initialValues = {},
  initialAuthType,
  onSubmit,
  onTest,
  onCancel,
  isLoading,
  isTesting,
  testResult,
}: IntegrationConfigFormProps) {
  const [authType, setAuthType] = useState<AuthCredentialType>(
    initialAuthType || integration.authTypes[0] || 'api_key'
  )
  const [values, setValues] = useState<Record<string, FieldValue>>(initialValues)
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({})

  useEffect(() => {
    setAuthType(initialAuthType || integration.authTypes[0] || 'api_key')
  }, [initialAuthType, integration.authTypes])

  useEffect(() => {
    setValues(initialValues)
  }, [initialValues])

  const handleFieldChange = (key: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  const toggleSecretVisibility = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({ authType, values })
  }

  const handleTest = async () => {
    if (onTest) {
      await onTest({ authType, values })
    }
  }

  const renderField = (field: IntegrationFieldDefinition) => {
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
              <CheckboxField key={option.value}>
                <Checkbox
                  name={`${field.key}[]`}
                  value={option.value}
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
              </CheckboxField>
            ))}
          </div>
        )

      case 'secret':
        return (
          <div className="relative">
            <Input
              type={showSecrets[field.key] ? 'text' : 'password'}
              name={field.key}
              value={value as string}
              onChange={(e) => handleFieldChange(field.key, e.target.value)}
              placeholder={field.placeholder || '••••••••'}
              required={field.required}
            />
            <button
              type="button"
              onClick={() => toggleSecretVisibility(field.key)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
              aria-label={showSecrets[field.key] ? 'Hide value' : 'Show value'}
            >
              {showSecrets[field.key] ? (
                <EyeClosedIcon className="size-4" />
              ) : (
                <EyeOpenIcon className="size-4" />
              )}
            </button>
          </div>
        )

      default:
        return null
    }
  }

  const formatAuthType = (type: AuthCredentialType): string => {
    const formats: Record<AuthCredentialType, string> = {
      api_key: 'API Key',
      oauth: 'OAuth 2.0',
      basic: 'Basic Auth',
      token: 'Personal Access Token',
    }
    return formats[type] || type
  }

  const SupportItem = ({
    label,
    supported,
  }: {
    label: string
    supported?: boolean
  }) => (
    <div className={`flex items-center gap-2 ${supported ? 'text-[var(--gray-11)]' : 'text-[var(--gray-8)]'}`}>
      {supported ? (
        <svg className="size-4 text-green-500" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg className="size-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clipRule="evenodd"
          />
        </svg>
      )}
      <span className="text-sm">{label}</span>
    </div>
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Authentication Section */}
      <section className="app-frame rounded-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <circle cx="12" cy="16" r="1" />
              <path d="M7 11V7a5 5 0 0110 0v4" />
            </svg>
          </div>
          <Text className="text-base font-semibold text-[var(--gray-12)]">Authentication</Text>
        </div>
        <Text className="text-sm text-[var(--gray-9)]">Choose how you want to authenticate with {integration.label}.</Text>

        <Fieldset className="mt-4">
          <FieldGroup>
            <Field>
              <Label>Authentication Type</Label>
              <Select
                value={authType}
                onChange={(val) => setAuthType(val as AuthCredentialType)}
              >
                {integration.authTypes.map((type) => (
                  <option key={type} value={type}>
                    {formatAuthType(type)}
                  </option>
                ))}
              </Select>
            </Field>
            {AUTH_FIELD_DEFINITIONS[authType]?.map((field) => (
              <Field key={field.key}>
                <Label>
                  {field.label}
                  {field.required && <span className="ml-1 text-red-500">*</span>}
                </Label>
                {field.description && <Description>{field.description}</Description>}
                {field.type !== 'boolean' ? (
                  renderField(field)
                ) : (
                  <div className="mt-2">{renderField(field)}</div>
                )}
              </Field>
            ))}
          </FieldGroup>
        </Fieldset>
      </section>

      {/* Configuration Fields Section */}
      {integration.configFields.length > 0 && (
        <section className="app-frame rounded-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 20h9M12 20l-4-4m4 4l-4 4M3 12h18M3 12l4-4m-4 4l4 4" />
              </svg>
            </div>
            <Text className="text-base font-semibold text-[var(--gray-12)]">Configuration</Text>
          </div>
          <Text className="text-sm text-[var(--gray-9)]">Configure the specific settings for your {integration.label} integration.</Text>

          <Fieldset className="mt-4">
            <FieldGroup>
              {integration.configFields.map((field) => (
                <Field key={field.key}>
                  <Label>
                    {field.label}
                    {field.required && <span className="ml-1 text-red-500">*</span>}
                  </Label>
                  {field.description && <Description>{field.description}</Description>}
                  {field.type !== 'boolean' ? (
                    renderField(field)
                  ) : (
                    <div className="mt-2">{renderField(field)}</div>
                  )}
                </Field>
              ))}
            </FieldGroup>
          </Fieldset>
        </section>
      )}

      {/* Features Section */}
      <section className="app-frame rounded-lg p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 11-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <Text className="text-base font-semibold text-[var(--gray-12)]">Supported Features</Text>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <SupportItem label="Issue Creation" supported={integration.supports.issues} />
          <SupportItem label="Webhooks" supported={integration.supports.webhooks} />
          <SupportItem label="Pull Requests" supported={integration.supports.pullRequests} />
        </div>
      </section>

      {/* Test Result */}
      {testResult && (
        <div
          className={`rounded-lg border p-4 ${
            testResult.success
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900/30 dark:bg-green-900/20 dark:text-green-400'
              : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400'
          }`}
        >
          <div className="flex items-start gap-3">
            {testResult.success ? (
              <svg className="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            ) : (
              <svg className="size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clipRule="evenodd"
                />
              </svg>
            )}
            <div>
              <p className="font-medium">{testResult.success ? 'Connection successful' : 'Connection failed'}</p>
              <p className="mt-1 text-sm opacity-90">{testResult.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col-reverse gap-4 border-t border-[var(--gray-6)] pt-6 sm:flex-row sm:justify-between">
        <div className="flex gap-4">
          <Button type="button" plain onClick={onCancel}>
            Cancel
          </Button>
        </div>
        <div className="flex gap-4">
          {onTest && (
            <Button type="button" outline onClick={handleTest} disabled={isTesting}>
              {isTesting ? 'Testing...' : 'Test Connection'}
            </Button>
          )}
          <Button type="submit" color="brand" disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Save Configuration'}
          </Button>
        </div>
      </div>
    </form>
  )
}
