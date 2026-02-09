import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
import { IntegrationConfigForm } from '@/components/integration-config-form'
import { Link } from '@/components/link'
import { Text } from '@/components/text'
import {
  createIntegration,
  deleteIntegrationWebhook,
  getAllIntegrationSummaries,
  getIntegration,
  getIntegrationDeliveries,
  getIntegrations,
  getIntegrationWebhook,
  retryIntegrationDelivery,
  saveIntegrationWebhook,
  testIntegration,
  updateIntegration,
  type IntegrationWebhookConfig,
  type IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import {
  ArrowLeftIcon,
  CheckCircledIcon,
  CircleIcon,
  CopyIcon,
  ExclamationTriangleIcon,
  GitHubLogoIcon,
} from '@radix-ui/react-icons'
import type { Integration, IntegrationSummary } from '@viberglass/types'
import { type AuthCredentialType, type TicketSystem } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'

// Icon mapping (same as in integration-card.tsx)
const INTEGRATION_ICON_COMPONENTS: Record<string, React.ComponentType<{ className?: string }>> = {
  github: GitHubLogoIcon,
  gitlab: GitLabIcon,
  bitbucket: BitbucketIcon,
  jira: JiraIcon,
  linear: LinearIcon,
  azure: AzureIcon,
  asana: AsanaIcon,
  trello: TrelloIcon,
  monday: MondayIcon,
  clickup: ClickUpIcon,
  shortcut: ShortcutIcon,
  slack: SlackIcon,
  custom: CustomIcon,
}

// Placeholder icons
function GitLabIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l3.65-11.23H8.35L12 21.35zM5.65 10.12L2 21.35h6.65L5.65 10.12zm12.7 0L22 21.35h-6.65l2.3-11.23zM12 2L8.35 10.12h7.3L12 2z" />
    </svg>
  )
}

function BitbucketIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3.5 5.5L5.2 19.2c.1.7.7 1.3 1.5 1.3h11.6c.7 0 1.3-.5 1.5-1.2l1.7-13.8H3.5zm11.2 10.4H9.3l-.9-5.4h7.2l-.9 5.4z" />
    </svg>
  )
}

function JiraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.5 24h6.9a.5.5 0 00.5-.5V12h-6.9a.5.5 0 00-.5.5v11zM11.5 0h-6.9a.5.5 0 00-.5.5v11h7.4a.5.5 0 00.5-.5V0h-.5z" />
    </svg>
  )
}

function LinearIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 12a9 9 0 0113.8-7.6l-9.4 9.4A9 9 0 013 12zm9 9a9 9 0 009-9 9 9 0 00-.6-3.2L11.8 18.4A9 9 0 0012 21zm6.2-16.2a9 9 0 00-12 12l12-12z" />
    </svg>
  )
}

function AzureIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.5 3v13.23l4.34 2.32 8.9-3.05L5.5 3zm2.1 2.8l6.7 7.2-5.6 1.9-1.1-9.1zM13 11l7 7.5-11.2 3.8L13 11z" />
    </svg>
  )
}

function AsanaIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.5 11.5a5.5 5.5 0 100-11 5.5 5.5 0 000 11zm-13 0a5.5 5.5 0 100-11 5.5 5.5 0 000 11zm13 2a5.5 5.5 0 110 11 5.5 5.5 0 010-11zm-13 0a5.5 5.5 0 110 11 5.5 5.5 0 010-11z" />
    </svg>
  )
}

function TrelloIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 3a2 2 0 00-2 2v14a2 2 0 002 2h16a2 2 0 002-2V5a2 2 0 00-2-2H4zm12.5 3a.5.5 0 01.5.5v9a.5.5 0 01-.5.5h-4a.5.5 0 01-.5-.5v-9a.5.5 0 01.5-.5h4zm-7 0a.5.5 0 01.5.5v5a.5.5 0 01-.5.5h-4a.5.5 0 01-.5-.5v-5a.5.5 0 01.5-.5h4z" />
    </svg>
  )
}

function MondayIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm-1 15l-5-5 1.4-1.4L11 14.2l5.6-5.6L18 10l-7 7z" />
    </svg>
  )
}

function ClickUpIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2zm0 4l6 6-6 6-6-6 6-6z" />
    </svg>
  )
}

function ShortcutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  )
}

function SlackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.124 2.521a2.528 2.528 0 012.52-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.52V8.834zm-1.271 0a2.528 2.528 0 01-2.521 2.521 2.528 2.528 0 01-2.521-2.521V2.522A2.528 2.528 0 0115.166 0a2.528 2.528 0 012.521 2.522v6.312zm-2.521 10.124a2.528 2.528 0 012.521 2.52A2.528 2.528 0 0115.166 24a2.528 2.528 0 01-2.521-2.522v-2.52h2.521zm0-1.271a2.528 2.528 0 01-2.521-2.521 2.528 2.528 0 012.521-2.521h6.313A2.528 2.528 0 0124 15.166a2.528 2.528 0 01-2.522 2.521h-6.312z" />
    </svg>
  )
}

function CustomIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 3v18M3 12h18M5.64 5.64l12.72 12.72M5.64 18.36L18.36 5.64" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

export function IntegrationDetailPage() {
  const navigate = useNavigate()
  const { integrationId } = useParams<{ integrationId: string }>()

  const [integration, setIntegration] = useState<IntegrationSummary | null>(null)
  const [existingIntegration, setExistingIntegration] = useState<Integration | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Webhook state
  const [webhookConfig, setWebhookConfig] = useState<IntegrationWebhookConfig | null>(null)
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [deliveries, setDeliveries] = useState<IntegrationWebhookDelivery[]>([])
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false)
  const [autoExecute, setAutoExecute] = useState(false)
  const [isSavingWebhook, setIsSavingWebhook] = useState(false)

  // Get the integration ID for webhook operations
  const integrationEntityId = existingIntegration?.id

  const initialValues = useMemo(
    () => (existingIntegration?.values as Record<string, string | number | boolean | string[]>) || {},
    [existingIntegration]
  )

  useEffect(() => {
    let isActive = true

    async function loadIntegration() {
      setIsPageLoading(true)
      setLoadError(null)

      try {
        const integrations = await getAllIntegrationSummaries()
        if (!isActive) return

        const selected = integrations.find((item) => item.id === integrationId)
        setIntegration(selected || null)

        if (selected?.configStatus === 'configured') {
          // Find the existing integration by system type
          const allIntegrations = await getIntegrations()
          if (!isActive) return
          const existing = allIntegrations.find((i) => i.system === integrationId)
          if (existing) {
            const fullIntegration = await getIntegration(existing.id)
            if (!isActive) return
            setExistingIntegration(fullIntegration)
          }
        } else {
          setExistingIntegration(null)
        }
      } catch (error) {
        if (!isActive) return
        setLoadError(error instanceof Error ? error.message : 'Failed to load integration')
        setIntegration(null)
        setExistingIntegration(null)
      } finally {
        if (isActive) {
          setIsPageLoading(false)
        }
      }
    }

    if (integrationId) {
      void loadIntegration()
    } else {
      setIsPageLoading(false)
    }

    return () => {
      isActive = false
    }
  }, [integrationId])

  // Load webhook config when integration is loaded
  useEffect(() => {
    let isActive = true

    async function loadWebhookData() {
      if (!integrationEntityId) {
        setWebhookConfig(null)
        setDeliveries([])
        return
      }

      setIsLoadingWebhook(true)
      try {
        const config = await getIntegrationWebhook(undefined, integrationId as TicketSystem)
        if (!isActive) return

        setWebhookConfig(config)
        if (config) {
          setAutoExecute(config.autoExecute)

          // Load deliveries
          const deliveryData = await getIntegrationDeliveries(undefined, integrationId as TicketSystem)
          if (!isActive) return
          setDeliveries(deliveryData)
        }
      } catch (error) {
        console.error('Failed to load webhook config:', error)
      } finally {
        if (isActive) {
          setIsLoadingWebhook(false)
        }
      }
    }

    void loadWebhookData()

    return () => {
      isActive = false
    }
  }, [integrationEntityId, integrationId])

  if (isPageLoading) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">Loading integration...</div>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-900/20">
          <ExclamationTriangleIcon className="mx-auto size-12 text-red-500" />
          <h2 className="mt-4 text-lg font-semibold text-red-900 dark:text-red-400">Failed to Load Integration</h2>
          <p className="mt-2 text-red-700 dark:text-red-300">{loadError}</p>
          <Button href="/settings/integrations" color="brand" className="mt-6">
            Back to Integrations
          </Button>
        </div>
      </div>
    )
  }

  if (!integration) {
    return (
      <div className="p-6 lg:p-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-900/20">
          <ExclamationTriangleIcon className="mx-auto size-12 text-red-500" />
          <h2 className="mt-4 text-lg font-semibold text-red-900 dark:text-red-400">Integration Not Found</h2>
          <p className="mt-2 text-red-700 dark:text-red-300">The integration you are looking for does not exist.</p>
          <Button href="/settings/integrations" color="brand" className="mt-6">
            Back to Integrations
          </Button>
        </div>
      </div>
    )
  }

  const IconComponent = (integrationId ? INTEGRATION_ICON_COMPONENTS[integrationId] : undefined) || CircleIcon

  const statusConfig = {
    configured: {
      icon: CheckCircledIcon,
      label: 'Configured',
      color: 'green' as const,
    },
    not_configured: {
      icon: CircleIcon,
      label: 'Not Configured',
      color: 'zinc' as const,
    },
    stub: {
      icon: ExclamationTriangleIcon,
      label: 'Coming Soon',
      color: 'amber' as const,
    },
  }

  const status = statusConfig[integration.configStatus as keyof typeof statusConfig]
  const StatusIcon = status.icon

  const handleSubmit = async (values: { authType: AuthCredentialType; values: Record<string, unknown> }) => {
    setIsLoading(true)
    try {
      if (existingIntegration) {
        // Update existing integration
        await updateIntegration(existingIntegration.id, {
          name: existingIntegration.name,
          authType: values.authType,
          values: values.values,
        })
      } else {
        // Create new integration
        await createIntegration({
          name: `${integration?.label || integrationId} Integration`,
          system: integrationId as TicketSystem,
          authType: values.authType,
          values: values.values,
        })
      }

      navigate('/settings/integrations')
    } catch (error) {
      console.error('Failed to save configuration:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleTest = async (values: { authType: AuthCredentialType; values: Record<string, unknown> }) => {
    setIsTesting(true)
    setTestResult(null)
    try {
      if (existingIntegration) {
        // Test existing integration
        const result = await testIntegration(existingIntegration.id)
        setTestResult(result)
      } else {
        // For new integrations, we can't test without creating first
        // Update the integration temporarily with new values and test
        setTestResult({
          success: false,
          message: 'Save the integration first to test the connection',
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleCancel = () => {
    navigate('/settings/integrations')
  }

  // Webhook handlers
  const handleGenerateSecret = async () => {
    if (!integrationEntityId) return

    setIsSavingWebhook(true)
    try {
      const config = await saveIntegrationWebhook(undefined, integrationId as TicketSystem, {
        generateSecret: true,
        autoExecute,
      })
      setWebhookConfig(config)
      toast.success('Webhook configured successfully')
    } catch (error) {
      console.error('Failed to generate webhook secret:', error)
      toast.error('Failed to setup webhook', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleSaveWebhook = async () => {
    if (!integrationEntityId || !webhookConfig) return

    setIsSavingWebhook(true)
    try {
      const config = await saveIntegrationWebhook(undefined, integrationId as TicketSystem, {
        autoExecute,
      })
      setWebhookConfig(config)
      toast.success('Webhook settings saved')
    } catch (error) {
      console.error('Failed to save webhook config:', error)
      toast.error('Failed to save webhook settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleDeleteWebhook = async () => {
    if (!integrationEntityId) return

    if (!confirm('Are you sure you want to remove the webhook configuration?')) {
      return
    }

    setIsSavingWebhook(true)
    try {
      await deleteIntegrationWebhook(undefined, integrationId as TicketSystem)
      setWebhookConfig(null)
      toast.success('Webhook removed successfully')
    } catch (error) {
      console.error('Failed to delete webhook:', error)
      toast.error('Failed to remove webhook', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleCopyWebhookUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Webhook URL copied to clipboard')
    } catch (error) {
      console.error('Failed to copy URL:', error)
      toast.error('Failed to copy URL')
    }
  }

  const handleRefreshDeliveries = async () => {
    if (!integrationEntityId) return

    setIsLoadingDeliveries(true)
    try {
      const data = await getIntegrationDeliveries(undefined, integrationId as TicketSystem)
      setDeliveries(data)
    } catch (error) {
      console.error('Failed to refresh deliveries:', error)
      toast.error('Failed to refresh deliveries')
    } finally {
      setIsLoadingDeliveries(false)
    }
  }

  const handleRetryDelivery = async (deliveryId: string) => {
    if (!integrationEntityId) return

    try {
      await retryIntegrationDelivery(undefined, integrationId as TicketSystem, deliveryId)
      toast.success('Delivery retry initiated')
      // Refresh the deliveries list
      void handleRefreshDeliveries()
    } catch (error) {
      console.error('Failed to retry delivery:', error)
      toast.error('Failed to retry delivery')
    }
  }

  // Check if integration supports webhooks (for now, GitHub, Jira, and custom)
  const supportsWebhooks = integrationId === 'github' || integrationId === 'jira' || integrationId === 'custom'

  // If integration is a stub, show coming soon message
  if (integration.status === 'stub') {
    return (
      <div className="space-y-8 p-6 lg:p-8">
        {/* Back Link */}
        <Link
          href="/settings/integrations"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Integrations
        </Link>

        {/* Header */}
        <div className="flex items-start gap-6">
          <div className="flex size-16 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
            <IconComponent className="size-8" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Heading>{integration.label}</Heading>
              <Badge color="amber">
                <StatusIcon className="mr-1 inline-block size-3" />
                {status.label}
              </Badge>
            </div>
            <Text className="mt-2 max-w-2xl">{integration.description}</Text>
          </div>
        </div>

        {/* Coming Soon Message */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900 dark:bg-amber-900/20">
          <ExclamationTriangleIcon className="mx-auto size-12 text-amber-500" />
          <h2 className="mt-4 text-lg font-semibold text-amber-900 dark:text-amber-400">Coming Soon</h2>
          <p className="mt-2 text-amber-700 dark:text-amber-300">
            The {integration.label} integration is currently under development. Check back soon!
          </p>
          <Button href="/settings/integrations" color="brand" className="mt-6">
            Back to Integrations
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8 p-6 lg:p-8">
      {/* Back Link */}
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="size-4" />
        Back to Integrations
      </Link>

      {/* Header */}
      <div className="flex items-start gap-6">
        <div className="bg-brand-gradient flex size-16 items-center justify-center rounded-xl text-white">
          <IconComponent className="size-8" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Heading>{integration.label}</Heading>
            <Badge color={status.color}>
              <StatusIcon className="mr-1 inline-block size-3" />
              {status.label}
            </Badge>
            {integration.category === 'scm' ? (
              <Badge color="blue">SCM</Badge>
            ) : integration.category === 'inbound' ? (
              <Badge color="teal">Inbound</Badge>
            ) : (
              <Badge color="purple">Ticketing</Badge>
            )}
          </div>
          <Text className="mt-2 max-w-2xl">{integration.description}</Text>
        </div>
      </div>

      {/* Configuration Form */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Subheading>Configuration</Subheading>
        <div className="mt-6">
          <IntegrationConfigForm
            integration={integration}
            initialValues={initialValues}
            initialAuthType={existingIntegration?.authType}
            onSubmit={handleSubmit}
            onTest={handleTest}
            onCancel={handleCancel}
            isLoading={isLoading}
            isTesting={isTesting}
            testResult={testResult}
          />
        </div>
      </section>

      {/* Webhook Section - only for integrations that support webhooks */}
      {supportsWebhooks && integration.configStatus === 'configured' && (
        <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
          <Subheading>Inbound Webhook</Subheading>
          <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Configure a webhook to receive events from {integration.label}.
          </Text>

          {isLoadingWebhook ? (
            <div className="mt-4 text-sm text-zinc-500">Loading webhook configuration...</div>
          ) : !webhookConfig ? (
            <div className="mt-4">
              <Button color="brand" onClick={handleGenerateSecret} disabled={isSavingWebhook}>
                {isSavingWebhook ? 'Setting up...' : 'Setup Webhook'}
              </Button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {/* Webhook URL */}
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Webhook URL</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={webhookConfig.webhookUrl}
                    className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <Button
                    color="zinc"
                    onClick={() => handleCopyWebhookUrl(webhookConfig.webhookUrl)}
                    title="Copy to clipboard"
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                </div>
              </div>

              {/* Webhook Secret */}
              <div>
                <label className="block text-sm font-medium text-zinc-900 dark:text-white">Webhook Secret</label>
                <div className="mt-1 flex gap-2">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    readOnly
                    value={webhookConfig.webhookSecret || '(hidden)'}
                    className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                  />
                  <Button color="zinc" onClick={() => setShowSecret(!showSecret)}>
                    {showSecret ? 'Hide' : 'Show'}
                  </Button>
                  <Button color="zinc" onClick={handleGenerateSecret} disabled={isSavingWebhook}>
                    Regenerate
                  </Button>
                </div>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Use this secret to verify webhook signatures. Keep it secure.
                </p>
              </div>

              {/* Auto-execute toggle */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoExecute"
                  checked={autoExecute}
                  onChange={(e) => setAutoExecute(e.target.checked)}
                  className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                />
                <label htmlFor="autoExecute" className="text-sm text-zinc-900 dark:text-white">
                  Auto-execute fixes on webhook events
                </label>
                {autoExecute !== webhookConfig.autoExecute && (
                  <Button color="brand" size="small" onClick={handleSaveWebhook} disabled={isSavingWebhook}>
                    {isSavingWebhook ? 'Saving...' : 'Save'}
                  </Button>
                )}
              </div>

              {/* Custom Webhook payload documentation */}
              {integrationId === 'custom' && (
                <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
                  <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Expected Payload Format</p>
                  <pre className="overflow-x-auto text-xs text-zinc-700 dark:text-zinc-300">
                    {`{
  "title": "string (required)",
  "description": "string (required)",
  "severity": "low | medium | high | critical (optional)",
  "category": "string (optional, default: 'bug')",
  "externalId": "string (optional, for deduplication)",
  "url": "string (optional, link back to source)"
}`}
                  </pre>
                  <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Send POST requests to the webhook URL with the payload above. Include{' '}
                    <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-700">
                      X-Webhook-Signature-256: sha256=&lt;hmac&gt;
                    </code>{' '}
                    header for signature verification.
                  </p>
                </div>
              )}

              {/* Delete webhook button */}
              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <Button color="red" onClick={handleDeleteWebhook} disabled={isSavingWebhook}>
                  Remove Webhook
                </Button>
              </div>

              {/* Delivery History */}
              <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Recent Deliveries</h4>
                  <Button color="zinc" size="small" onClick={handleRefreshDeliveries} disabled={isLoadingDeliveries}>
                    {isLoadingDeliveries ? 'Refreshing...' : 'Refresh'}
                  </Button>
                </div>

                {deliveries.length === 0 ? (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No webhook deliveries yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-zinc-50 text-xs text-zinc-700 uppercase dark:bg-zinc-800 dark:text-zinc-400">
                        <tr>
                          <th className="px-3 py-2">Event</th>
                          <th className="px-3 py-2">Status</th>
                          <th className="px-3 py-2">Ticket</th>
                          <th className="px-3 py-2">Time</th>
                          <th className="px-3 py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {deliveries.map((delivery) => (
                          <tr key={delivery.id} className="border-b border-zinc-200 dark:border-zinc-800">
                            <td className="px-3 py-2">{delivery.eventType}</td>
                            <td className="px-3 py-2">
                              <Badge
                                color={
                                  delivery.status === 'succeeded'
                                    ? 'green'
                                    : delivery.status === 'failed'
                                      ? 'red'
                                      : 'amber'
                                }
                              >
                                {delivery.status}
                              </Badge>
                              {delivery.errorMessage && (
                                <span className="ml-2 text-xs text-red-600 dark:text-red-400">
                                  {delivery.errorMessage}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2">{delivery.ticketId || '-'}</td>
                            <td className="px-3 py-2 text-zinc-500">{new Date(delivery.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-2">
                              {delivery.status === 'failed' && (
                                <Button color="zinc" size="small" onClick={() => handleRetryDelivery(delivery.id)}>
                                  Retry
                                </Button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}
