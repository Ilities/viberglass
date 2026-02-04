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
import type {
  WebhookConfig,
  CreateWebhookConfigDTO,
  SecretLocation,
  WebhookProvider,
} from '@/service/api/webhook-api'

interface WebhookConfigFormProps {
  projectId?: string
  config?: WebhookConfig
  onSave: (config: WebhookConfig) => void
  onCancel: () => void
  isSubmitting?: boolean
}

const GITHUB_ALLOWED_EVENTS = ['issues', 'issue_comment', 'pull_request', 'push'] as const
const JIRA_ALLOWED_EVENTS = ['issue_created', 'issue_updated', 'issue_deleted'] as const

export function WebhookConfigForm({
  projectId,
  config,
  onSave,
  onCancel,
  isSubmitting = false,
}: WebhookConfigFormProps) {
  const [provider, setProvider] = useState<WebhookProvider>(config?.provider || 'github')
  const [providerProjectId, setProviderProjectId] = useState(config?.providerProjectId || '')
  const [secretLocation, setSecretLocation] = useState<SecretLocation>(
    config?.secretLocation || 'database'
  )
  const [webhookSecret, setWebhookSecret] = useState('')
  const [showSecret, setShowSecret] = useState(false)
  const [allowedEvents, setAllowedEvents] = useState<string[]>(config?.allowedEvents || ['issues'])
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

    if (!providerProjectId.trim()) {
      newErrors.providerProjectId = 'Provider project ID is required'
    }

    if (provider === 'github' && !/^[\w-]+\/[\w.-]+$/.test(providerProjectId)) {
      newErrors.providerProjectId = 'Must be in format: owner/repo'
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

  const currentEvents = provider === 'github' ? GITHUB_ALLOWED_EVENTS : JIRA_ALLOWED_EVENTS

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Fieldset>
        <Field>
          <Label>Provider</Label>
          <Description>Select the webhook provider platform</Description>
          <Select
            value={provider}
            onChange={(value) => {
              setProvider(value as WebhookProvider)
              setAllowedEvents([])
            }}
            disabled={isEdit}
          >
            <option value="github">GitHub</option>
            <option value="jira">Jira</option>
          </Select>
        </Field>

        <Field>
          <Label>Provider Project ID</Label>
          <Description>
            {provider === 'github'
              ? 'GitHub repository in format: owner/repo (e.g., facebook/react)'
              : 'Jira project key (e.g., PROJ)'}
          </Description>
          <Input
            value={providerProjectId}
            onChange={(e) => setProviderProjectId(e.target.value)}
            placeholder={provider === 'github' ? 'owner/repo' : 'PROJ'}
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
}

export function SetupInstructions({
  provider,
  providerProjectId,
  webhookUrl,
  webhookSecret,
  allowedEvents,
}: SetupInstructionsProps) {
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
            Setup Instructions for {provider === 'github' ? 'GitHub' : 'Jira'}
          </Text>
          <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Configure your {provider === 'github' ? 'GitHub repository' : 'Jira project'} webhook
            settings:
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

        {provider === 'github' && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
            <Text className="text-sm text-amber-800 dark:text-amber-200">
              <strong>Tip:</strong> In GitHub, go to Settings &gt; Webhooks &gt; Add webhook to
              configure these settings.
            </Text>
          </div>
        )}
      </div>
    </div>
  )
}

function formatEventName(event: string): string {
  return event
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
