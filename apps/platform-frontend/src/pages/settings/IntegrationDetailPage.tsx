import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading } from '@/components/heading'
import { IntegrationConfigForm } from '@/components/integration-config-form'
import { PageMeta } from '@/components/page-meta'
import {
  getIntegrationCategoryConfig,
  getIntegrationIcon,
  getIntegrationStatusConfig,
} from '@/components/integration-visuals'

import { Text } from '@/components/text'
import {
  createIntegration,
  getIntegrationManifests,
  getConnectionIssueRules,
  getIntegration,
  getChatStatus,
  testIntegration,
  updateIntegration,
  type ConnectionSpaceRule,
} from '@/service/api/integration-api'
import { getProjects, type Project } from '@/service/api/project-api'
import { integrationFrontendRegistry } from '@/integrations/registerFrontendIntegrationPlugins'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import type { Integration, IntegrationManifest } from '@viberglass/types'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CustomInboundWebhookSection } from './integration-detail/CustomInboundWebhookSection'
import { IntegrationCredentialSection } from './integration-detail/IntegrationCredentialSection'
import {
  IntegrationDetailErrorState,
  IntegrationDetailLoadingState,
  IntegrationDetailNotFoundState,
} from './integration-detail/IntegrationDetailStates'
import { ConnectionNameSection } from './integration-detail/ConnectionNameSection'
import { CreateIntegrationPrompt } from './integration-detail/CreateIntegrationPrompt'
import { RemoveIntegrationSection } from './integration-detail/RemoveIntegrationSection'
import { TrackerWebhookSection } from './integration-detail/TrackerWebhookSection'
import { useIntegrationWebhookSettings } from './integration-detail/useIntegrationWebhookSettings'

export function IntegrationDetailPage() {
  const navigate = useNavigate()
  const { integrationEntityId: integrationEntityIdParam, integrationSystem: integrationSystemParam } = useParams<{
    integrationEntityId?: string
    integrationSystem?: string
  }>()

  const [integrationType, setIntegrationType] = useState<IntegrationManifest | null>(null)
  const [existingIntegration, setExistingIntegration] = useState<Integration | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [chatBotConfigured, setChatBotConfigured] = useState<boolean | null>(null)
  const [spaceRules, setSpaceRules] = useState<ConnectionSpaceRule[]>([])

  const integrationEntityId = existingIntegration?.id
  const integrationSystem = integrationType?.id
  const isConfigured = Boolean(existingIntegration)
  // Registry lookup: the integration's own components.
  const frontendPlugin = integrationSystem ? integrationFrontendRegistry.get(integrationSystem) : undefined
  const AuthSection = frontendPlugin?.AuthSetupSection
  const trackerWebhook = frontendPlugin?.trackerWebhook
  // Stable, so the install section doesn't refetch the status on every render.
  const getBotStatus = useCallback(
    () => (integrationSystem ? getChatStatus(integrationSystem) : Promise.resolve({ configured: false })),
    [integrationSystem]
  )

  const webhook = useIntegrationWebhookSettings({
    integrationEntityId,
  })

  const initialValues = useMemo(
    () => (existingIntegration?.config as Record<string, string | number | boolean | string[]>) || {},
    [existingIntegration]
  )

  useEffect(() => {
    let isActive = true

    async function loadIntegration() {
      if (!integrationEntityIdParam && !integrationSystemParam) {
        setIsPageLoading(false)
        setIntegrationType(null)
        setExistingIntegration(null)
        setProjects(null)
        return
      }

      setIsPageLoading(true)
      setLoadError(null)

      try {
        const availableTypes = await getIntegrationManifests()
        if (!isActive) {
          return
        }

        const typeMap = new Map(availableTypes.map((type) => [type.id, type]))

        if (integrationSystemParam) {
          const type = typeMap.get(integrationSystemParam)
          setIntegrationType(type || null)
          setExistingIntegration(null)
          return
        }

        if (!integrationEntityIdParam) {
          setIntegrationType(null)
          setExistingIntegration(null)
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

        // Spaces, for choosing which space a webhook's deliveries go to.
        if (type.webhookProvider) {
          try {
            const loadedProjects = await getProjects()
            if (isActive) {
              setProjects(loadedProjects)
            }
          } catch (projectError) {
            console.error('Failed to load spaces:', projectError)
          }
        } else if (isActive) {
          setProjects(null)
        }
      } catch (error) {
        if (!isActive) {
          return
        }

        setLoadError(error instanceof Error ? error.message : 'Failed to load the connection')
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

  // A connection made by installing an app is connected when the app is installed.
  useEffect(() => {
    if (!AuthSection) {
      return
    }
    getBotStatus()
      .then(({ configured }) => setChatBotConfigured(configured))
      .catch(() => setChatBotConfigured(false))
  }, [AuthSection, getBotStatus])

  useEffect(() => {
    if (!integrationEntityId || !trackerWebhook) {
      setSpaceRules([])
      return
    }
    getConnectionIssueRules(integrationEntityId)
      .then(setSpaceRules)
      .catch(() => setSpaceRules([]))
  }, [integrationEntityId, trackerWebhook])

  if (isPageLoading) {
    return <IntegrationDetailLoadingState />
  }

  if (loadError) {
    return <IntegrationDetailErrorState message={loadError} />
  }

  if (!integrationType) {
    return <IntegrationDetailNotFoundState />
  }

  const configStatus =
    integrationType.status === 'stub'
      ? 'stub'
      : AuthSection
        ? chatBotConfigured
          ? 'configured'
          : 'not_configured'
        : isConfigured
          ? 'configured'
          : 'not_configured'
  const IconComponent = getIntegrationIcon(integrationType.id)
  const status = getIntegrationStatusConfig(configStatus)
  const category = getIntegrationCategoryConfig(integrationType.category)
  const StatusIcon = status.icon

  // ---- Form handlers ---------------------------------------------------------

  const handleSubmit = async (config: Record<string, unknown>) => {
    if (!integrationSystem) {
      return
    }

    setIsSavingConfig(true)

    try {
      const savedIntegration = existingIntegration
        ? await updateIntegration(existingIntegration.id, {
            name: existingIntegration.name,
            config,
          })
        : await createIntegration({
            name: integrationType.label,
            system: integrationSystem,
            config,
          })

      setExistingIntegration(savedIntegration)
      navigate(`/settings/connections/${savedIntegration.id}`, {
        replace: !existingIntegration,
      })
    } catch (error) {
      console.error('Failed to save integration configuration:', error)
    } finally {
      setIsSavingConfig(false)
    }
  }

  const handleTest = async (_config: Record<string, unknown>) => {
    setIsTesting(true)
    setTestResult(null)

    try {
      if (!existingIntegration) {
        setTestResult({
          success: false,
          message: 'Save the connection first to test it',
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
    navigate('/settings/connections')
  }

  if (integrationType.status === 'stub') {
    return (
      <div className="space-y-8 p-6 lg:p-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-4">
          <Button href="/settings/connections" plain>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to connections
          </Button>
        </div>

        {/* Header Section */}
        <div className="flex items-start gap-4">
          {/* Integration Avatar */}
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-[var(--gray-4)] text-[var(--gray-9)]">
            <IconComponent className="h-7 w-7" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <Heading className="text-2xl">{integrationType.label}</Heading>
              <Badge color="amber">
                <StatusIcon className="mr-1 inline-block h-3 w-3" />
                {status.label}
              </Badge>
            </div>
            <Text className="mt-1.5 text-[var(--gray-9)] max-w-2xl">{integrationType.description}</Text>
          </div>
        </div>

        <div className="app-frame rounded-lg p-8 text-center border-warning-200 dark:border-warning-900/50">
          <StatusIcon className="mx-auto h-12 w-12 text-warning-500" />
          <h2 className="mt-4 text-lg font-semibold text-warning-900 dark:text-warning-400">Coming soon</h2>
          <p className="mt-2 text-[var(--gray-9)]">
            The {integrationType.label} connection isn&apos;t available yet.
          </p>
          <Button href="/settings/connections" color="brand" className="mt-6">
            Back to connections
          </Button>
        </div>
      </div>
    )
  }

  return (
    <>
      <PageMeta title={`${integrationType.label} | Connection`} />
      <div className="space-y-8 p-6 lg:p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-4">
        <Button href="/settings/connections" plain>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to connections
        </Button>
      </div>

      {/* Header Section */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Integration Avatar */}
          <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-gradient-to-br from-[var(--accent-4)] to-[var(--accent-3)] text-[var(--accent-11)] shadow-sm">
            <IconComponent className="h-7 w-7" />
          </div>

          <div>
            <div className="flex items-center gap-3">
              <Heading className="text-2xl">{integrationType.label}</Heading>
              <Badge color={status.color}>
                <StatusIcon className="mr-1 inline-block h-3 w-3" />
                {status.label}
              </Badge>
              <Badge color={category.color}>{category.label}</Badge>
            </div>
            <Text className="mt-1.5 text-[var(--gray-9)] max-w-2xl">{integrationType.description}</Text>
          </div>
        </div>
      </div>

      {!existingIntegration && !AuthSection ? (
        <CreateIntegrationPrompt
          label={integrationType.label}
          system={integrationType.id}
          onCreated={(integrationId) => navigate(`/settings/connections/${integrationId}`, { replace: true })}
        />
      ) : (
      <>
      {existingIntegration && (
        <ConnectionNameSection integration={existingIntegration} onRenamed={setExistingIntegration} />
      )}

      {AuthSection && <AuthSection getBotStatus={getBotStatus} />}

      {integrationType.configFields.length > 0 && (
        <IntegrationConfigForm
          integration={integrationType}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onTest={handleTest}
          onCancel={handleCancel}
          isLoading={isSavingConfig}
          isTesting={isTesting}
          testResult={testResult}
        />
      )}

      {/* Inbound webhook section */}
      {isConfigured && integrationType.webhookProvider && (
        !trackerWebhook ? (
          <CustomInboundWebhookSection
            planNewIssues={webhook.planNewIssues}
            deliveries={webhook.deliveries}
            hasInboundChanges={webhook.hasInboundChanges}
            inboundActive={webhook.inboundActive}
            inboundWebhooks={webhook.inboundWebhooks}
            isLoadingDeliveries={webhook.isLoadingDeliveries}
            isLoadingWebhook={webhook.isLoadingWebhook}
            isSavingWebhook={webhook.isSavingWebhook}
            projects={projects}
            selectedInboundConfig={webhook.selectedInboundConfig}
            selectedInboundConfigId={webhook.selectedInboundConfigId}
            selectedProjectId={webhook.selectedInboundProjectId}
            showSecret={webhook.showSecret}
            onPlanNewIssuesChange={webhook.setPlanNewIssues}
            onCopyWebhookSecret={webhook.handleCopyWebhookSecret}
            onCopyWebhookUrl={webhook.handleCopyWebhookUrl}
            onCreateInboundWebhook={(projectId) => webhook.handleCreateInboundWebhook(projectId)}
            onDeleteInboundWebhook={webhook.handleDeleteInboundWebhook}
            onGenerateSecret={() =>
              webhook.handleGenerateSecret(webhook.selectedInboundProjectId)
            }
            onInboundActiveChange={webhook.setInboundActive}
            onProjectChange={webhook.setSelectedInboundProjectId}
            onRefreshDeliveries={webhook.handleRefreshDeliveries}
            onRetryDelivery={webhook.handleRetryDelivery}
            onSaveWebhook={() => webhook.handleSaveInboundWebhook(webhook.selectedInboundProjectId)}
            onSelectInboundWebhook={webhook.handleSelectInboundWebhook}
            onToggleSecretVisibility={() => webhook.setShowSecret(!webhook.showSecret)}
          />
        ) : (
          <TrackerWebhookSection
            tracker={trackerWebhook}
            webhook={webhook}
            spaceRules={spaceRules}
            projects={projects}
          />
        )
      )}

      {existingIntegration && integrationType.credentialUse && (
        <IntegrationCredentialSection
          integrationId={existingIntegration.id}
          credentialUse={integrationType.credentialUse}
        />
      )}

      {existingIntegration && (
        <RemoveIntegrationSection
          integrationId={existingIntegration.id}
          name={existingIntegration.name}
          onRemoved={() => navigate('/settings/connections')}
        />
      )}
      </>
      )}
    </div>
    </>
  )
}
