import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import {
  deleteIntegrationOutboundWebhook,
  getIntegrationOutboundWebhooks,
  saveIntegrationOutboundWebhook,
  testIntegrationOutboundWebhook,
  type IntegrationOutboundWebhookConfig,
  type IntegrationOutboundWebhookTestResult,
} from '@/service/api/integration-api'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

type CustomOutboundEvent = 'job_started' | 'job_ended'
type CustomOutboundMethod = 'POST' | 'PUT' | 'PATCH'
type CustomAuthType = 'none' | 'bearer' | 'basic' | 'header'
type SignatureAlgorithm = 'sha256' | 'sha1'

interface HeaderEntry {
  id: string
  key: string
  value: string
}

interface FormState {
  name: string
  targetUrl: string
  method: CustomOutboundMethod
  headers: HeaderEntry[]
  authType: CustomAuthType
  authToken: string
  authUsername: string
  authPassword: string
  authHeaderName: string
  authHeaderValue: string
  signingSecret: string
  signatureAlgorithm: SignatureAlgorithm
  retryMaxAttempts: string
  retryBackoffMs: string
  retryMaxBackoffMs: string
  active: boolean
  emitJobStarted: boolean
  emitJobEnded: boolean
}

interface FormErrors {
  name?: string
  targetUrl?: string
  method?: string
  events?: string
  headers?: string
  auth?: string
  signingSecret?: string
  retry?: string
}

interface TestResultSummary extends IntegrationOutboundWebhookTestResult {
  testedAt: string
}

interface CustomOutboundWebhookSectionProps {
  integrationEntityId?: string
}

const DEFAULT_FORM: FormState = {
  name: '',
  targetUrl: '',
  method: 'POST',
  headers: [],
  authType: 'none',
  authToken: '',
  authUsername: '',
  authPassword: '',
  authHeaderName: '',
  authHeaderValue: '',
  signingSecret: '',
  signatureAlgorithm: 'sha256',
  retryMaxAttempts: '1',
  retryBackoffMs: '250',
  retryMaxBackoffMs: '2000',
  active: true,
  emitJobStarted: true,
  emitJobEnded: true,
}

function createHeaderId(): string {
  return `hdr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function toHeaderEntries(headers: Record<string, string> | undefined): HeaderEntry[] {
  if (!headers) {
    return []
  }

  return Object.entries(headers).map(([key, value], index) => ({
    id: `${key}-${index}`,
    key,
    value,
  }))
}

function toFormState(config: IntegrationOutboundWebhookConfig): FormState {
  const auth = config.auth
  const retryPolicy = config.retryPolicy || { maxAttempts: 1, backoffMs: 250, maxBackoffMs: 2000 }

  return {
    name: config.name || '',
    targetUrl: config.targetUrl || '',
    method: config.method || 'POST',
    headers: toHeaderEntries(config.headers),
    authType: auth?.type || 'none',
    authToken: '',
    authUsername: auth?.username || '',
    authPassword: '',
    authHeaderName: auth?.headerName || '',
    authHeaderValue: '',
    signingSecret: '',
    signatureAlgorithm: config.signatureAlgorithm || 'sha256',
    retryMaxAttempts: String(retryPolicy.maxAttempts),
    retryBackoffMs: String(retryPolicy.backoffMs),
    retryMaxBackoffMs: String(retryPolicy.maxBackoffMs),
    active: config.active,
    emitJobStarted: config.events.includes('job_started'),
    emitJobEnded: config.events.includes('job_ended'),
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function parseNumber(value: string): number | null {
  if (!value.trim()) {
    return null
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return null
  }

  return Math.trunc(parsed)
}

function formatEventSummary(events: string[]): string {
  if (events.length === 0) {
    return 'No events enabled'
  }

  return events.join(', ')
}

export function CustomOutboundWebhookSection({
  integrationEntityId,
}: CustomOutboundWebhookSectionProps) {
  const [destinations, setDestinations] = useState<IntegrationOutboundWebhookConfig[]>([])
  const [selectedDestinationId, setSelectedDestinationId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [isCreatingNew, setIsCreatingNew] = useState(false)
  const [form, setForm] = useState<FormState>(DEFAULT_FORM)
  const [errors, setErrors] = useState<FormErrors>({})
  const [showAuthSecret, setShowAuthSecret] = useState(false)
  const [showSigningSecret, setShowSigningSecret] = useState(false)
  const [showHeaderValues, setShowHeaderValues] = useState(false)
  const [lastTestResult, setLastTestResult] = useState<TestResultSummary | null>(null)

  const selectedDestination = useMemo(
    () => destinations.find((destination) => destination.id === selectedDestinationId) || null,
    [destinations, selectedDestinationId]
  )

  useEffect(() => {
    let isMounted = true

    async function loadDestinations() {
      if (!integrationEntityId) {
        setDestinations([])
        setSelectedDestinationId(null)
        setForm(DEFAULT_FORM)
        setIsCreatingNew(true)
        return
      }

      setIsLoading(true)
      try {
        const configs = await getIntegrationOutboundWebhooks(integrationEntityId)
        if (!isMounted) {
          return
        }

        const customConfigs = configs.filter((config) => config.provider === 'custom')
        setDestinations(customConfigs)

        if (customConfigs.length === 0) {
          setSelectedDestinationId(null)
          setForm(DEFAULT_FORM)
          setIsCreatingNew(true)
          return
        }

        const first = customConfigs[0]
        setSelectedDestinationId(first.id)
        setForm(toFormState(first))
        setIsCreatingNew(false)
      } catch (error) {
        console.error('Failed to load custom outbound destinations:', error)
        toast.error('Failed to load outbound destinations', {
          description: error instanceof Error ? error.message : 'Unknown error',
        })
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    void loadDestinations()
    return () => {
      isMounted = false
    }
  }, [integrationEntityId])

  const onSelectDestination = (destination: IntegrationOutboundWebhookConfig) => {
    setSelectedDestinationId(destination.id)
    setForm(toFormState(destination))
    setErrors({})
    setIsCreatingNew(false)
    setLastTestResult(null)
    setShowAuthSecret(false)
    setShowSigningSecret(false)
  }

  const onCreateNewDestination = () => {
    setSelectedDestinationId(null)
    setForm(DEFAULT_FORM)
    setErrors({})
    setIsCreatingNew(true)
    setLastTestResult(null)
    setShowAuthSecret(false)
    setShowSigningSecret(false)
  }

  const updateForm = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }))
  }

  const updateHeader = (id: string, patch: Partial<HeaderEntry>) => {
    setForm((previous) => ({
      ...previous,
      headers: previous.headers.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    }))
  }

  const addHeader = () => {
    setForm((previous) => ({
      ...previous,
      headers: [...previous.headers, { id: createHeaderId(), key: '', value: '' }],
    }))
  }

  const removeHeader = (id: string) => {
    setForm((previous) => ({
      ...previous,
      headers: previous.headers.filter((entry) => entry.id !== id),
    }))
  }

  const validateForm = (): FormErrors => {
    const nextErrors: FormErrors = {}
    const headerKeys = new Set<string>()
    const cleanedHeaders = form.headers.filter((entry) => entry.key.trim() || entry.value.trim())

    if (!form.name.trim()) {
      nextErrors.name = 'Destination name is required'
    }

    if (!form.targetUrl.trim()) {
      nextErrors.targetUrl = 'Destination URL is required'
    } else if (!isHttpUrl(form.targetUrl.trim())) {
      nextErrors.targetUrl = 'Destination URL must be a valid http/https URL'
    }

    if (!['POST', 'PUT', 'PATCH'].includes(form.method)) {
      nextErrors.method = 'Method must be POST, PUT, or PATCH'
    }

    if (!form.emitJobStarted && !form.emitJobEnded) {
      nextErrors.events = 'Enable at least one outbound event'
    }

    for (const header of cleanedHeaders) {
      const key = header.key.trim()
      if (!key) {
        nextErrors.headers = 'Header keys cannot be empty when a value is provided'
        break
      }

      const normalizedKey = key.toLowerCase()
      if (headerKeys.has(normalizedKey)) {
        nextErrors.headers = `Duplicate header key: ${key}`
        break
      }
      headerKeys.add(normalizedKey)
    }

    const existingAuth = selectedDestination?.auth
    if (form.authType === 'bearer') {
      const hasStoredToken = Boolean(existingAuth?.hasToken)
      if (!form.authToken.trim() && !(selectedDestination && hasStoredToken)) {
        nextErrors.auth = 'Bearer auth requires a token'
      }
    }

    if (form.authType === 'basic') {
      const hasStoredPassword = Boolean(existingAuth?.hasPassword)
      if (!form.authUsername.trim()) {
        nextErrors.auth = 'Basic auth requires a username'
      } else if (!form.authPassword.trim() && !(selectedDestination && hasStoredPassword)) {
        nextErrors.auth = 'Basic auth requires a password'
      }
    }

    if (form.authType === 'header') {
      const hasStoredHeaderValue = Boolean(existingAuth?.hasHeaderValue)
      if (!form.authHeaderName.trim()) {
        nextErrors.auth = 'Header auth requires a header name'
      } else if (!form.authHeaderValue.trim() && !(selectedDestination && hasStoredHeaderValue)) {
        nextErrors.auth = 'Header auth requires a header value'
      }
    }

    const maxAttempts = parseNumber(form.retryMaxAttempts)
    const backoffMs = parseNumber(form.retryBackoffMs)
    const maxBackoffMs = parseNumber(form.retryMaxBackoffMs)
    if (
      maxAttempts === null ||
      backoffMs === null ||
      maxBackoffMs === null ||
      maxAttempts < 1 ||
      maxAttempts > 10 ||
      backoffMs < 0 ||
      backoffMs > 60000 ||
      maxBackoffMs < backoffMs ||
      maxBackoffMs > 600000
    ) {
      nextErrors.retry = 'Retry policy must satisfy: attempts 1-10, backoff 0-60000, max backoff >= backoff'
    }

    if (form.signingSecret.trim() && !['sha256', 'sha1'].includes(form.signatureAlgorithm)) {
      nextErrors.signingSecret = 'Signature algorithm must be sha256 or sha1'
    }

    return nextErrors
  }

  const onSaveDestination = async () => {
    if (!integrationEntityId) {
      return
    }

    const validationErrors = validateForm()
    setErrors(validationErrors)
    if (Object.keys(validationErrors).length > 0) {
      return
    }

    const events: CustomOutboundEvent[] = []
    if (form.emitJobStarted) {
      events.push('job_started')
    }
    if (form.emitJobEnded) {
      events.push('job_ended')
    }

    const headers = form.headers
      .filter((entry) => entry.key.trim())
      .reduce<Record<string, string>>((accumulator, entry) => {
        accumulator[entry.key.trim()] = entry.value
        return accumulator
      }, {})

    const authPayload =
      form.authType === 'bearer'
        ? {
            type: 'bearer' as const,
            token: form.authToken.trim() || undefined,
          }
        : form.authType === 'basic'
          ? {
              type: 'basic' as const,
              username: form.authUsername.trim(),
              password: form.authPassword.trim() || undefined,
            }
          : form.authType === 'header'
            ? {
                type: 'header' as const,
                headerName: form.authHeaderName.trim(),
                headerValue: form.authHeaderValue.trim() || undefined,
              }
            : {
                type: 'none' as const,
              }

    setIsSaving(true)
    try {
      const saved = await saveIntegrationOutboundWebhook(
        integrationEntityId,
        {
          active: form.active,
          auth: authPayload,
          events,
          headers,
          method: form.method,
          name: form.name.trim(),
          retryPolicy: {
            maxAttempts: Number(form.retryMaxAttempts),
            backoffMs: Number(form.retryBackoffMs),
            maxBackoffMs: Number(form.retryMaxBackoffMs),
          },
          signatureAlgorithm: form.signatureAlgorithm,
          signingSecret: form.signingSecret.trim() || undefined,
          targetUrl: form.targetUrl.trim(),
        },
        selectedDestination?.id
      )

      setDestinations((previous) => {
        const index = previous.findIndex((item) => item.id === saved.id)
        if (index >= 0) {
          return previous.map((item) => (item.id === saved.id ? saved : item))
        }
        return [saved, ...previous]
      })

      setSelectedDestinationId(saved.id)
      setForm(toFormState(saved))
      setIsCreatingNew(false)
      setErrors({})
      toast.success(selectedDestination ? 'Destination updated' : 'Destination created')
    } catch (error) {
      console.error('Failed to save custom outbound destination:', error)
      toast.error('Failed to save destination', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const onDeleteDestination = async () => {
    if (!integrationEntityId || !selectedDestination) {
      return
    }

    if (!window.confirm('Are you sure you want to remove this outbound destination?')) {
      return
    }

    setIsSaving(true)
    try {
      await deleteIntegrationOutboundWebhook(integrationEntityId, selectedDestination.id)
      const next = destinations.filter((item) => item.id !== selectedDestination.id)
      setDestinations(next)

      if (next.length === 0) {
        setSelectedDestinationId(null)
        setForm(DEFAULT_FORM)
        setIsCreatingNew(true)
      } else {
        setSelectedDestinationId(next[0].id)
        setForm(toFormState(next[0]))
        setIsCreatingNew(false)
      }

      setLastTestResult(null)
      setErrors({})
      toast.success('Destination removed')
    } catch (error) {
      console.error('Failed to delete custom outbound destination:', error)
      toast.error('Failed to remove destination', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const onTestDestination = async () => {
    if (!integrationEntityId) {
      return
    }

    const destinationId = selectedDestination?.id
    if (!destinationId) {
      return
    }

    const eventType: CustomOutboundEvent | undefined = form.emitJobEnded
      ? 'job_ended'
      : form.emitJobStarted
        ? 'job_started'
        : undefined

    setIsSendingTest(true)
    try {
      const result = await testIntegrationOutboundWebhook(integrationEntityId, destinationId, eventType)
      setLastTestResult({
        ...result,
        testedAt: new Date().toISOString(),
      })

      if (result.success) {
        toast.success('Test send completed', {
          description: result.message,
        })
      } else {
        toast.error('Test send failed', {
          description: result.message,
        })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      setLastTestResult({
        success: false,
        message,
        testedAt: new Date().toISOString(),
      })
      toast.error('Test send failed', { description: message })
    } finally {
      setIsSendingTest(false)
    }
  }

  const testSendDisabled = !selectedDestination || isCreatingNew || isSaving || isSendingTest

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Custom Outbound Destinations</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Configure multiple outbound destinations with destination-specific auth, headers, retry policy, and event
        selection.
      </Text>

      {isLoading ? (
        <div className="mt-4 text-sm text-zinc-500">Loading outbound destinations...</div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <div className="space-y-2">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">Destinations</p>
              <Button color="zinc" size="small" onClick={onCreateNewDestination} disabled={isSaving}>
                Add
              </Button>
            </div>

            {destinations.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-300 p-3 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                No destinations configured yet.
              </div>
            ) : (
              destinations.map((destination) => {
                const selected = destination.id === selectedDestinationId && !isCreatingNew
                return (
                  <button
                    key={destination.id}
                    type="button"
                    onClick={() => onSelectDestination(destination)}
                    className={[
                      'w-full rounded-md border px-3 py-2 text-left transition',
                      selected
                        ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20'
                        : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
                    ].join(' ')}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                        {destination.name || destination.targetUrl || destination.id}
                      </span>
                      <Badge color={destination.active ? 'green' : 'amber'}>
                        {destination.active ? 'Active' : 'Disabled'}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {formatEventSummary(destination.events)}
                    </p>
                  </button>
                )
              })
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">
                {isCreatingNew ? 'Create destination' : 'Edit destination'}
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Sensitive fields stay masked. Enter a new value only when rotating a secret.
              </p>
            </div>

            <div>
              <label htmlFor="customOutboundDestinationName" className="block text-sm font-medium text-zinc-900 dark:text-white">
                Destination name
              </label>
              <input
                id="customOutboundDestinationName"
                type="text"
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
                placeholder="Primary sink"
                className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              />
              {errors.name && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{errors.name}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="customOutboundDestinationUrl" className="block text-sm font-medium text-zinc-900 dark:text-white">
                  Destination URL
                </label>
                <input
                  id="customOutboundDestinationUrl"
                  type="url"
                  value={form.targetUrl}
                  onChange={(event) => updateForm('targetUrl', event.target.value)}
                  placeholder="https://hooks.example.com/viberator"
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Method</label>
                <select
                  value={form.method}
                  onChange={(event) => updateForm('method', event.target.value as CustomOutboundMethod)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  <option value="POST">POST</option>
                  <option value="PUT">PUT</option>
                  <option value="PATCH">PATCH</option>
                </select>
              </div>
            </div>
            {errors.targetUrl && <p className="text-xs text-red-600 dark:text-red-400">{errors.targetUrl}</p>}
            {errors.method && <p className="text-xs text-red-600 dark:text-red-400">{errors.method}</p>}

            <div className="space-y-2">
              <p className="text-sm font-medium text-zinc-900 dark:text-white">Events</p>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.emitJobStarted}
                  onChange={(event) => updateForm('emitJobStarted', event.target.checked)}
                  className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                />
                <span className="text-sm text-zinc-900 dark:text-white">Emit `job_started`</span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={form.emitJobEnded}
                  onChange={(event) => updateForm('emitJobEnded', event.target.checked)}
                  className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                />
                <span className="text-sm text-zinc-900 dark:text-white">Emit `job_ended`</span>
              </label>
              {errors.events && <p className="text-xs text-red-600 dark:text-red-400">{errors.events}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-zinc-900 dark:text-white">Headers</p>
                <div className="flex gap-2">
                  <Button color="zinc" size="small" onClick={() => setShowHeaderValues((value) => !value)}>
                    {showHeaderValues ? 'Hide values' : 'Show values'}
                  </Button>
                  <Button color="zinc" size="small" onClick={addHeader}>
                    Add header
                  </Button>
                </div>
              </div>

              {form.headers.length === 0 ? (
                <p className="text-xs text-zinc-500 dark:text-zinc-400">No custom headers configured.</p>
              ) : (
                <div className="space-y-2">
                  {form.headers.map((header) => (
                    <div key={header.id} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                      <input
                        type="text"
                        value={header.key}
                        onChange={(event) => updateHeader(header.id, { key: event.target.value })}
                        placeholder="x-api-key"
                        className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <input
                        type={showHeaderValues ? 'text' : 'password'}
                        value={header.value}
                        onChange={(event) => updateHeader(header.id, { value: event.target.value })}
                        placeholder={showHeaderValues ? 'value' : 'stored header value'}
                        className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <Button color="red" size="small" onClick={() => removeHeader(header.id)}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {errors.headers && <p className="text-xs text-red-600 dark:text-red-400">{errors.headers}</p>}
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-medium text-zinc-900 dark:text-white">Authentication</label>
              <select
                value={form.authType}
                onChange={(event) => updateForm('authType', event.target.value as CustomAuthType)}
                className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
              >
                <option value="none">None</option>
                <option value="bearer">Bearer token</option>
                <option value="basic">Basic auth</option>
                <option value="header">Custom header</option>
              </select>

              {form.authType !== 'none' && (
                <Button color="zinc" size="small" onClick={() => setShowAuthSecret((value) => !value)}>
                  {showAuthSecret ? 'Hide secret values' : 'Show secret values'}
                </Button>
              )}

              {form.authType === 'bearer' && (
                <div>
                  <input
                    type={showAuthSecret ? 'text' : 'password'}
                    value={form.authToken}
                    onChange={(event) => updateForm('authToken', event.target.value)}
                    placeholder={
                      selectedDestination?.auth?.hasToken ? 'Stored token (enter to rotate)' : 'Bearer token'
                    }
                    className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              )}

              {form.authType === 'basic' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={form.authUsername}
                    onChange={(event) => updateForm('authUsername', event.target.value)}
                    placeholder="Username"
                    className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <input
                    type={showAuthSecret ? 'text' : 'password'}
                    value={form.authPassword}
                    onChange={(event) => updateForm('authPassword', event.target.value)}
                    placeholder={
                      selectedDestination?.auth?.hasPassword ? 'Stored password (enter to rotate)' : 'Password'
                    }
                    className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              )}

              {form.authType === 'header' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    value={form.authHeaderName}
                    onChange={(event) => updateForm('authHeaderName', event.target.value)}
                    placeholder="x-auth-token"
                    className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <input
                    type={showAuthSecret ? 'text' : 'password'}
                    value={form.authHeaderValue}
                    onChange={(event) => updateForm('authHeaderValue', event.target.value)}
                    placeholder={
                      selectedDestination?.auth?.hasHeaderValue
                        ? 'Stored header value (enter to rotate)'
                        : 'Header value'
                    }
                    className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                </div>
              )}

              {errors.auth && <p className="text-xs text-red-600 dark:text-red-400">{errors.auth}</p>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Signing secret</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type={showSigningSecret ? 'text' : 'password'}
                    value={form.signingSecret}
                    onChange={(event) => updateForm('signingSecret', event.target.value)}
                    placeholder={
                      selectedDestination?.hasSigningSecret
                        ? 'Stored secret (enter to rotate)'
                        : 'Optional HMAC signing secret'
                    }
                    className="w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <Button color="zinc" onClick={() => setShowSigningSecret((value) => !value)}>
                    {showSigningSecret ? 'Hide' : 'Show'}
                  </Button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Signature algorithm</label>
                <select
                  value={form.signatureAlgorithm}
                  onChange={(event) => updateForm('signatureAlgorithm', event.target.value as SignatureAlgorithm)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  <option value="sha256">sha256</option>
                  <option value="sha1">sha1</option>
                </select>
              </div>
            </div>
            {errors.signingSecret && <p className="text-xs text-red-600 dark:text-red-400">{errors.signingSecret}</p>}

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Max attempts</label>
                <input
                  type="number"
                  min={1}
                  max={10}
                  value={form.retryMaxAttempts}
                  onChange={(event) => updateForm('retryMaxAttempts', event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Backoff (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={60000}
                  value={form.retryBackoffMs}
                  onChange={(event) => updateForm('retryBackoffMs', event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Max backoff (ms)</label>
                <input
                  type="number"
                  min={0}
                  max={600000}
                  value={form.retryMaxBackoffMs}
                  onChange={(event) => updateForm('retryMaxBackoffMs', event.target.value)}
                  className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                />
              </div>
            </div>
            {errors.retry && <p className="text-xs text-red-600 dark:text-red-400">{errors.retry}</p>}

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(event) => updateForm('active', event.target.checked)}
                className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
              />
              <span className="text-sm text-zinc-900 dark:text-white">Destination active</span>
            </label>

            {lastTestResult && (
              <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">Last test send</p>
                  <Badge color={lastTestResult.success ? 'green' : 'red'}>
                    {lastTestResult.success ? 'Succeeded' : 'Failed'}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">{lastTestResult.message}</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {new Date(lastTestResult.testedAt).toLocaleString()}
                  {lastTestResult.statusCode ? ` - HTTP ${lastTestResult.statusCode}` : ''}
                </p>
              </div>
            )}

            <div className="flex flex-wrap gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
              <Button color="brand" onClick={onSaveDestination} disabled={isSaving}>
                {isSaving ? 'Saving...' : isCreatingNew ? 'Create destination' : 'Save destination'}
              </Button>
              <Button color="zinc" onClick={onTestDestination} disabled={testSendDisabled}>
                {isSendingTest ? 'Sending test...' : 'Test send'}
              </Button>
              {selectedDestination && !isCreatingNew && (
                <Button color="red" onClick={onDeleteDestination} disabled={isSaving}>
                  Delete destination
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
