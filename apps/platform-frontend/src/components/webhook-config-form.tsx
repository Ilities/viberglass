import { useState } from 'react'
import { toast } from 'sonner'
import {
  Field,
  Fieldset,
  Label,
  Description,
  ErrorMessage,
} from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Text } from '@/components/text'
import {
  ExclamationTriangleIcon,
  EyeOpenIcon,
  EyeClosedIcon,
  ClipboardIcon,
} from '@radix-ui/react-icons'
import {
  DEFAULT_WEBHOOK_PROVIDER_DEFINITIONS,
  type WebhookProviderFormDefinition,
} from '@/components/webhook-provider-definitions'
import type {
  WebhookConfig,
  CreateWebhookConfigDTO,
  SecretLocation,
  WebhookProvider,
} from '@/service/api/webhook-api'

interface WebhookConfigFormProps {
  projectId?: string
  config?: WebhookConfig
  providerDefinitions?: readonly WebhookProviderFormDefinition[]
  onSave: (config: WebhookConfig) => void
  onCancel: () => void
  isSubmitting?: boolean
}

export function WebhookConfigForm({
  projectId,
  config,
  providerDefinitions,
  onSave,
  onCancel,
  isSubmitting = false,
}: WebhookConfigFormProps) {
  const resolvedProviderDefinitions = resolveProviderDefinitions(providerDefinitions)
  const providerDefinitionsById = buildProviderDefinitionMap(resolvedProviderDefinitions)
  const fallbackProvider = resolvedProviderDefinitions[0]?.id || 'github'
  const initialProvider =
    config?.provider && providerDefinitionsById.has(config.provider) ? config.provider : fallbackProvider

  const [provider, setProvider] = useState<WebhookProvider>(initialProvider)
  const [providerProjectId, setProviderProjectId] = useState(config?.providerProjectId || '')
  const [secretLocation, setSecretLocation] = useState<SecretLocation>(
    config?.secretLocation || 'database'
  )
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [allowedEvents, setAllowedEvents] = useState<string[]>(
    config?.allowedEvents ||
      getProviderDefaultEvents(
        providerDefinitionsById.get(initialProvider)
      )
  )
  const [autoExecute, setAutoExecute] = useState(config?.autoExecute ?? false)
  const [botUsername, setBotUsername] = useState(config?.botUsername || '')
  const [active, setActive] = useState(config?.active ?? true)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const isEdit = !!config
  const selectedEvents = allowedEvents

  function generateSecret() {
    const array = new Uint8Array(32)
    crypto.getRandomValues(array)
    const secret = Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('')
    setWebhookSecret(secret)
    toast.success('Secret generated', {
      description: 'A new secure webhook secret has been generated.',
    })
  }

  function toggleEvent(event: string) {
    setAllowedEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    const providerDefinition = providerDefinitionsById.get(provider)

    if (!providerDefinition) {
      newErrors.provider = 'Selected provider is not supported'
    }

    if (!providerProjectId.trim()) {
      newErrors.providerProjectId = 'Provider project ID is required'
    }

    if (!newErrors.providerProjectId && providerDefinition?.validateProjectId) {
      const providerProjectIdError = providerDefinition.validateProjectId(providerProjectId.trim())
      if (providerProjectIdError) {
        newErrors.providerProjectId = providerProjectIdError
      }
    }

    if (!isEdit && !webhookSecret.trim()) {
      newErrors.webhookSecret = 'Webhook secret is required for new configurations'
    }

    if (allowedEvents.length === 0) {
      newErrors.allowedEvents = 'At least one event must be selected'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    if (!validate()) {
      return
    }

    const dto: CreateWebhookConfigDTO & { id?: string } = {
      provider,
      providerProjectId,
      projectId,
      secretLocation,
      webhookSecret: webhookSecret || undefined,
      allowedEvents,
      autoExecute,
      botUsername: botUsername || undefined,
      labelMappings: {},
      active,
    }

    if (isEdit && config) {
      dto.id = config.id
    }

    onSave(dto as WebhookConfig)
  }

  const currentProviderDefinition = providerDefinitionsById.get(provider)
  const currentEvents = currentProviderDefinition?.allowedEvents || []
  const providerProjectIdLabel = currentProviderDefinition?.projectIdLabel || 'Provider Project ID'
  const providerProjectIdDescription =
    currentProviderDefinition?.projectIdDescription || 'Provider-specific project identifier'
  const providerProjectIdPlaceholder = currentProviderDefinition?.projectIdPlaceholder || ''

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Fieldset>
        <Field>
          <Label>Provider</Label>
          <Description>Select the webhook provider platform</Description>
          <Select
            value={provider}
            onChange={(value) => {
              const selectedProvider = value as WebhookProvider
              setProvider(selectedProvider)
              setAllowedEvents(
                getProviderDefaultEvents(providerDefinitionsById.get(selectedProvider))
              )
            }}
            disabled={isEdit}
          >
            {resolvedProviderDefinitions.map((definition) => (
              <option key={definition.id} value={definition.id}>
                {definition.label}
              </option>
            ))}
          </Select>
          {errors.provider && <ErrorMessage>{errors.provider}</ErrorMessage>}
        </Field>

        <Field>
          <Label>{providerProjectIdLabel}</Label>
          <Description>{providerProjectIdDescription}</Description>
          <Input
            value={providerProjectId}
            onChange={(e) => setProviderProjectId(e.target.value)}
            placeholder={providerProjectIdPlaceholder}
            invalid={!!errors.providerProjectId}
          />
          {errors.providerProjectId && (
            <ErrorMessage>{errors.providerProjectId}</ErrorMessage>
          )}
        </Field>

        <Field>
          <Label>Secret Location</Label>
          <Description>Where to store the webhook secret</Description>
          <Select
            value={secretLocation}
            onChange={(value) => setSecretLocation(value as SecretLocation)}
          >
            <option value="database">Database (encrypted)</option>
            <option value="ssm">AWS SSM Parameter Store</option>
            <option value="env">Environment Variable</option>
          </Select>
        </Field>

        <Field>
          <Label>Webhook Secret</Label>
          <Description>
            {isEdit
              ? 'Leave blank to keep existing secret unchanged'
              : 'Secret used to verify webhook signatures'}
          </Description>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showSecret ? 'text' : 'password'}
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder={isEdit ? '(unchanged)' : 'Enter or generate secret'}
                invalid={!!errors.webhookSecret}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                {showSecret ? (
                  <EyeClosedIcon className="h-5 w-5" />
                ) : (
                  <EyeOpenIcon className="h-5 w-5" />
                )}
              </button>
            </div>
            <Button
              type="button"
              onClick={generateSecret}
              plain
              disabled={isSubmitting}
            >
              Generate
            </Button>
          </div>
          {errors.webhookSecret && <ErrorMessage>{errors.webhookSecret}</ErrorMessage>}
        </Field>

        <SwitchField>
          <Label>Active</Label>
          <Description>Enable this webhook configuration</Description>
          <Switch
            checked={active}
            onChange={setActive}
            color="emerald"
          />
        </SwitchField>
      </Fieldset>

      <Fieldset>
        <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
          Event Configuration
        </Text>

        <div className="space-y-3">
          <Text className="text-sm text-zinc-600 dark:text-zinc-400">
            Select which events should trigger webhook processing
          </Text>
          {errors.allowedEvents && <ErrorMessage>{errors.allowedEvents}</ErrorMessage>}

          {currentEvents.map((event) => (
            <CheckboxField key={event}>
              <Checkbox
                checked={selectedEvents.includes(event)}
                onChange={() => toggleEvent(event)}
                name={`event_${event}`}
              />
              <Label className="text-sm">{formatEventName(event)}</Label>
            </CheckboxField>
          ))}
        </div>
      </Fieldset>

      <Fieldset>
        <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
          Execution Settings
        </Text>

        <SwitchField>
          <Label>Auto Execute</Label>
          <Description>
            Automatically create and run jobs when webhook is received
          </Description>
          <Switch
            checked={autoExecute}
            onChange={setAutoExecute}
            color="emerald"
          />
        </SwitchField>

        <Field>
          <Label>Bot Username</Label>
          <Description>
            Username for bot mention detection (e.g., @viberator-bot)
          </Description>
          <Input
            value={botUsername}
            onChange={(e) => setBotUsername(e.target.value)}
            placeholder="viberator-bot"
          />
        </Field>
      </Fieldset>

      {/* Setup instructions panel - shown after save in parent component */}

      <div className="flex justify-end gap-4 pt-4">
        <Button
          type="button"
          plain
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          color="brand"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Configuration'}
        </Button>
      </div>
    </form>
  )
}

interface SetupInstructionsProps {
  provider: WebhookProvider
  providerProjectId: string
  webhookUrl?: string
  webhookSecret?: string
  allowedEvents: string[]
  providerDefinitions?: readonly WebhookProviderFormDefinition[]
}

export function SetupInstructions({
  provider,
  providerProjectId,
  webhookUrl,
  webhookSecret,
  allowedEvents,
  providerDefinitions,
}: SetupInstructionsProps) {
  const resolvedProviderDefinitions = resolveProviderDefinitions(providerDefinitions)
  const providerDefinition = buildProviderDefinitionMap(resolvedProviderDefinitions).get(provider)
  const providerLabel = providerDefinition?.label || provider
  const providerTargetLabel = providerDefinition?.setupInstructions?.targetLabel || providerLabel
  const providerTip = providerDefinition?.setupInstructions?.tip

  const handleCopyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied`, {
      description: 'Copied to clipboard',
    })
  }

  const defaultUrl =
    typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}/api/webhooks/${provider}`
      : `https://your-domain.com/api/webhooks/${provider}`

  const displayUrl = webhookUrl || defaultUrl
  const displaySecret = webhookSecret || '••••••••••••••••'

  return (
    <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-6 dark:border-zinc-700 dark:bg-zinc-900">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
          <ExclamationTriangleIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="min-w-0 flex-1">
          <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
            Setup Instructions for {providerLabel}
          </Text>
          <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Configure your {providerTargetLabel} webhook settings:
          </Text>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Payload URL
          </Text>
          <div className="mt-1 flex gap-2">
            <code className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
              {displayUrl}
            </code>
            <Button
              type="button"
              plain
              onClick={() => handleCopyToClipboard(displayUrl, 'Payload URL')}
              className="shrink-0"
            >
              <ClipboardIcon className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div>
          <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Content type
          </Text>
          <code className="mt-1 block rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
            application/json
          </code>
        </div>

        <div>
          <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Secret
          </Text>
          <div className="mt-1 flex gap-2">
            <code className="flex-1 rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
              {displaySecret}
            </code>
            {webhookSecret && (
              <Button
                type="button"
                plain
                onClick={() => handleCopyToClipboard(webhookSecret, 'Secret')}
                className="shrink-0"
              >
                <ClipboardIcon className="h-5 w-5" />
              </Button>
            )}
          </div>
        </div>

        <div>
          <Text className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
            Events
          </Text>
          <code className="mt-1 block rounded border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-200">
            {allowedEvents.map(formatEventName).join(', ')}
          </code>
        </div>

        {providerTip && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <Text className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Tip:</strong> {providerTip}
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

function resolveProviderDefinitions(
  providerDefinitions?: readonly WebhookProviderFormDefinition[]
): readonly WebhookProviderFormDefinition[] {
  return providerDefinitions?.length
    ? providerDefinitions
    : DEFAULT_WEBHOOK_PROVIDER_DEFINITIONS
}

function buildProviderDefinitionMap(
  providerDefinitions: readonly WebhookProviderFormDefinition[]
): Map<WebhookProvider, WebhookProviderFormDefinition> {
  return new Map(providerDefinitions.map((definition) => [definition.id, definition]))
}

function getProviderDefaultEvents(
  providerDefinition?: WebhookProviderFormDefinition
): string[] {
  const defaultEvents =
    providerDefinition?.defaultAllowedEvents || providerDefinition?.allowedEvents || []
  return [...defaultEvents]
}

function formatEventName(event: string): string {
  return event
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
