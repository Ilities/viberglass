import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import {
  getIntegrationCategoryConfig,
  getIntegrationIcon,
  getIntegrationStatusConfig,
} from '@/components/integration-visuals'
import { IntegrationConfigForm } from '@/components/integration-config-form'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { Text } from '@/components/text'
import {
  createIntegration,
  getAvailableIntegrationTypes,
  getIntegration,
  getIntegrations,
  testIntegration,
  updateIntegration,
  type AvailableIntegrationType,
} from '@/service/api/integration-api'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import type { AuthCredentialType, Integration, TicketSystem } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  IntegrationDetailErrorState,
  IntegrationDetailLoadingState,
  IntegrationDetailNotFoundState,
} from './integration-detail/IntegrationDetailStates'
import { InboundWebhookSection } from './integration-detail/InboundWebhookSection'
import { OutboundWebhookSection } from './integration-detail/OutboundWebhookSection'
import { getIntegrationDetailCapabilities } from './integration-detail/capabilities'
import { useIntegrationWebhookSettings } from './integration-detail/useIntegrationWebhookSettings'

export function IntegrationDetailPage() {
  const navigate = useNavigate()
  const { integrationEntityId: integrationEntityIdParam, integrationSystem: integrationSystemParam } =
    useParams<{ integrationEntityId?: string; integrationSystem?: string }>()

  const [integrationType, setIntegrationType] = useState<AvailableIntegrationType | null>(null)
  const [existingIntegration, setExistingIntegration] = useState<Integration | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  const integrationEntityId = existingIntegration?.id
  const integrationSystem = integrationType?.id
  const isConfigured = Boolean(existingIntegration)

  const webhook = useIntegrationWebhookSettings({
    integrationEntityId,
  })

  const capabilities = getIntegrationDetailCapabilities(integrationSystem)

  const initialValues = useMemo(
    () => (existingIntegration?.values as Record<string, string | number | boolean | string[]>) || {},
    [existingIntegration]
  )

  useEffect(() => {
    let isActive = true

    async function loadIntegration() {
      if (!integrationEntityIdParam && !integrationSystemParam) {
        setIsPageLoading(false)
        setIntegrationType(null)
        setExistingIntegration(null)
        return
      }

      setIsPageLoading(true)
      setLoadError(null)

      try {
        const availableTypes = await getAvailableIntegrationTypes()
        if (!isActive) {
          return
        }

        const typeMap = new Map(availableTypes.map((type) => [type.id, type]))

        if (integrationSystemParam) {
          const type = typeMap.get(integrationSystemParam as TicketSystem)
          setIntegrationType(type || null)
          setExistingIntegration(null)
          return
        }

        if (!integrationEntityIdParam) {
          setIntegrationType(null)
          setExistingIntegration(null)
          return
        }

        const legacyType = typeMap.get(integrationEntityIdParam as TicketSystem)
        if (legacyType) {
          const integrations = await getIntegrations(legacyType.id)
          if (!isActive) {
            return
          }

          if (integrations.length === 1) {
            navigate(`/settings/integrations/${integrations[0].id}`, { replace: true })
            return
          }

          if (integrations.length === 0) {
            navigate(`/settings/integrations/new/${legacyType.id}`, { replace: true })
            return
          }

          navigate('/settings/integrations', { replace: true })
          return
        }

        const fullIntegration = await getIntegration(integrationEntityIdParam)
        if (!isActive) {
          return
        }

        const type = typeMap.get(fullIntegration.system)
        if (!type) {
          setIntegrationType(null)
          setExistingIntegration(null)
          setLoadError(`Unsupported integration system: ${fullIntegration.system}`)
          return
        }

        setIntegrationType(type)
        setExistingIntegration(fullIntegration)
      } catch (error) {
        if (!isActive) {
          return
        }

        setLoadError(error instanceof Error ? error.message : 'Failed to load integration')
        setIntegrationType(null)
        setExistingIntegration(null)
      } finally {
        if (isActive) {
          setIsPageLoading(false)
        }
      }
    }

    void loadIntegration()

    return () => {
      isActive = false
    }
  }, [integrationEntityIdParam, integrationSystemParam, navigate])

  if (isPageLoading) {
    return <IntegrationDetailLoadingState />
  }

  if (loadError) {
    return <IntegrationDetailErrorState message={loadError} />
  }

  if (!integrationType) {
    return <IntegrationDetailNotFoundState />
  }

  const configStatus = integrationType.status === 'stub' ? 'stub' : isConfigured ? 'configured' : 'not_configured'
  const IconComponent = getIntegrationIcon(integrationType.id)
  const status = getIntegrationStatusConfig(configStatus)
  const category = getIntegrationCategoryConfig(integrationType.category)
  const StatusIcon = status.icon

  const handleSubmit = async (values: {
    authType: AuthCredentialType
    values: Record<string, unknown>
  }) => {
    if (!integrationSystem) {
      return
    }

    setIsSavingConfig(true)

    try {
      const savedIntegration = existingIntegration
        ? await updateIntegration(existingIntegration.id, {
            name: existingIntegration.name,
            authType: values.authType,
            values: values.values,
          })
        : await createIntegration({
            name: `${integrationType.label} Integration`,
            system: integrationSystem,
            authType: values.authType,
            values: values.values,
          })

      setExistingIntegration(savedIntegration)
      navigate(`/settings/integrations/${savedIntegration.id}`, {
        replace: !existingIntegration,
      })
    } catch (error) {
      console.error('Failed to save integration configuration:', error)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleTest = async (_values: {
    authType: AuthCredentialType
    values: Record<string, unknown>
  }) => {
    setIsTesting(true)
    setTestResult(null)

    try {
      if (!existingIntegration) {
        setTestResult({
          success: false,
          message: 'Save the integration first to test the connection',
        })
        return
      }

      const result = await testIntegration(existingIntegration.id)
      setTestResult(result)
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

  if (integrationType.status === 'stub') {
    return (
      <div className="space-y-8 p-6 lg:p-8">
        <Link
          href="/settings/integrations"
          className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
        >
          <ArrowLeftIcon className="size-4" />
          Back to Integrations
        </Link>

        <div className="flex items-start gap-6">
          <div className="flex size-16 items-center justify-center rounded-xl bg-zinc-100 text-zinc-400 dark:bg-zinc-800">
            <IconComponent className="size-8" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Heading>{integrationType.label}</Heading>
              <Badge color="amber">
                <StatusIcon className="mr-1 inline-block size-3" />
                {status.label}
              </Badge>
            </div>
            <Text className="mt-2 max-w-2xl">{integrationType.description}</Text>
          </div>
        </div>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-900 dark:bg-amber-900/20">
          <StatusIcon className="mx-auto size-12 text-amber-500" />
          <h2 className="mt-4 text-lg font-semibold text-amber-900 dark:text-amber-400">Coming Soon</h2>
          <p className="mt-2 text-amber-700 dark:text-amber-300">
            The {integrationType.label} integration is currently under development. Check back soon!
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
      <Link
        href="/settings/integrations"
        className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
      >
        <ArrowLeftIcon className="size-4" />
        Back to Integrations
      </Link>

      <div className="flex items-start gap-6">
        <div className="bg-brand-gradient flex size-16 items-center justify-center rounded-xl text-white">
          <IconComponent className="size-8" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Heading>{integrationType.label}</Heading>
            <Badge color={status.color}>
              <StatusIcon className="mr-1 inline-block size-3" />
              {status.label}
            </Badge>
            <Badge color={category.color}>{category.label}</Badge>
          </div>
          <Text className="mt-2 max-w-2xl">{integrationType.description}</Text>
        </div>
      </div>

      <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
        <Subheading>Configuration</Subheading>
        <div className="mt-6">
          <IntegrationConfigForm
            integration={integrationType}
            initialValues={initialValues}
            initialAuthType={existingIntegration?.authType}
            onSubmit={handleSubmit}
            onTest={handleTest}
            onCancel={handleCancel}
            isLoading={isSavingConfig}
            isTesting={isTesting}
            testResult={testResult}
          />
        </div>
      </section>

      {isConfigured && capabilities.supportsInboundWebhooks && (
        <InboundWebhookSection
          autoExecute={webhook.autoExecute}
          deliveries={webhook.deliveries}
          hasInboundChanges={webhook.hasInboundChanges}
          inboundWebhooks={webhook.inboundWebhooks}
          isLoadingDeliveries={webhook.isLoadingDeliveries}
          isLoadingWebhook={webhook.isLoadingWebhook}
          isSavingWebhook={webhook.isSavingWebhook}
          selectedInboundConfig={webhook.selectedInboundConfig}
          selectedInboundConfigId={webhook.selectedInboundConfigId}
          showCustomPayloadHelp={capabilities.showCustomInboundPayloadHelp}
          showSecret={webhook.showSecret}
          onAutoExecuteChange={webhook.setAutoExecute}
          onCopyWebhookUrl={webhook.handleCopyWebhookUrl}
          onCreateInboundWebhook={webhook.handleCreateInboundWebhook}
          onDeleteInboundWebhook={webhook.handleDeleteInboundWebhook}
          onGenerateSecret={webhook.handleGenerateSecret}
          onRefreshDeliveries={webhook.handleRefreshDeliveries}
          onRetryDelivery={webhook.handleRetryDelivery}
          onSaveWebhook={webhook.handleSaveInboundWebhook}
          onSelectInboundWebhook={webhook.handleSelectInboundWebhook}
          onToggleSecretVisibility={() => webhook.setShowSecret(!webhook.showSecret)}
        />
      )}

      {isConfigured && capabilities.supportsOutboundWebhooks && (
        <OutboundWebhookSection
          emitJobEnded={webhook.emitJobEnded}
          emitJobStarted={webhook.emitJobStarted}
          hasOutboundChanges={webhook.hasOutboundChanges}
          isSavingWebhook={webhook.isSavingWebhook}
          outboundApiToken={webhook.outboundApiToken}
          outboundWebhook={webhook.outboundWebhook}
          onDeleteOutboundWebhook={webhook.handleDeleteOutboundWebhook}
          onEmitJobEndedChange={webhook.setEmitJobEnded}
          onEmitJobStartedChange={webhook.setEmitJobStarted}
          onOutboundApiTokenChange={webhook.setOutboundApiToken}
          onSaveOutboundWebhook={webhook.handleSaveOutboundWebhook}
        />
      )}
    </div>
  )
}
