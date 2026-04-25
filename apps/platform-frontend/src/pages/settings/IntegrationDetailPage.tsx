import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Heading, Subheading } from '@/components/heading'
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
  deleteIntegrationOutboundWebhook,
  getAvailableIntegrationTypes,
  getIntegration,
  getIntegrationOutboundWebhooks,
  getSlackBotStatus,
  saveIntegrationOutboundWebhook,
  testIntegration,
  testIntegrationOutboundWebhook,
  updateIntegration,
  type AvailableIntegrationType,
} from '@/service/api/integration-api'
import { getProjects, type Project } from '@/service/api/project-api'
import { integrationFrontendRegistry } from '@/integrations/registerFrontendIntegrationPlugins'
import { ArrowLeftIcon } from '@radix-ui/react-icons'
import type { Integration, TicketSystem } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CustomInboundWebhookSection } from './integration-detail/CustomInboundWebhookSection'
import { InboundWebhookSection } from './integration-detail/InboundWebhookSection'
import { IntegrationCredentialSection } from './integration-detail/IntegrationCredentialSection'
import {
  IntegrationDetailErrorState,
  IntegrationDetailLoadingState,
  IntegrationDetailNotFoundState,
} from './integration-detail/IntegrationDetailStates'
import { OutboundWebhookSection } from './integration-detail/OutboundWebhookSection'
import { getIntegrationDetailCapabilities } from './integration-detail/capabilities'
import { useIntegrationWebhookSettings } from './integration-detail/useIntegrationWebhookSettings'

const GITHUB_REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/

function normalizeGitHubRequiredLabels(rawLabels: string[]): string[] {
  const labels: string[] = []
  for (const rawLabel of rawLabels) {
    const normalized = rawLabel.trim().toLowerCase()
    if (!normalized || labels.includes(normalized)) {
      continue
    }
    labels.push(normalized)
  }
  return labels
}

export function IntegrationDetailPage() {
  const navigate = useNavigate()
  const { integrationEntityId: integrationEntityIdParam, integrationSystem: integrationSystemParam } = useParams<{
    integrationEntityId?: string
    integrationSystem?: string
  }>()

  const [integrationType, setIntegrationType] = useState<AvailableIntegrationType | null>(null)
  const [existingIntegration, setExistingIntegration] = useState<Integration | null>(null)
  const [isPageLoading, setIsPageLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSavingConfig, setIsSavingConfig] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [isAutoCreating, setIsAutoCreating] = useState(false)
  const [slackBotConfigured, setSlackBotConfigured] = useState<boolean | null>(null)

  const integrationEntityId = existingIntegration?.id
  const integrationSystem = integrationType?.id
  const isConfigured = Boolean(existingIntegration)
  const isGithubIntegration = integrationSystem === 'github'
  const isJiraIntegration = integrationSystem === 'jira'
  const isShortcutIntegration = integrationSystem === 'shortcut'
  const isCustomIntegration = integrationSystem === 'custom'
  const isSlackIntegration = integrationSystem === 'slack'

  const webhook = useIntegrationWebhookSettings({
    integrationEntityId,
  })

  const capabilities = getIntegrationDetailCapabilities(integrationSystem)

  const initialValues = useMemo(
    () => (existingIntegration?.config as Record<string, string | number | boolean | string[]>) || {},
    [existingIntegration]
  )
  const githubRepositoryMapping = useMemo(() => {
    if (!isGithubIntegration) {
      return null
    }

    if (
      typeof webhook.selectedInboundProviderProjectId === 'string' &&
      webhook.selectedInboundProviderProjectId.trim().length > 0
    ) {
      return webhook.selectedInboundProviderProjectId.trim()
    }

    const fromWebhookConfig = webhook.outboundWebhook?.providerProjectId
    if (typeof fromWebhookConfig === 'string' && fromWebhookConfig.trim().length > 0) {
      return fromWebhookConfig.trim()
    }

    const owner = typeof initialValues.owner === 'string' ? initialValues.owner.trim() : ''
    const repo = typeof initialValues.repo === 'string' ? initialValues.repo.trim() : ''
    if (owner && repo) {
      return `${owner}/${repo}`
    }

    return null
  }, [
    initialValues,
    isGithubIntegration,
    webhook.outboundWebhook?.providerProjectId,
    webhook.selectedInboundProviderProjectId,
  ])

  const jiraProjectMapping = useMemo(() => {
    if (!isJiraIntegration) {
      return null
    }

    if (
      typeof webhook.selectedInboundProviderProjectId === 'string' &&
      webhook.selectedInboundProviderProjectId.trim().length > 0
    ) {
      return webhook.selectedInboundProviderProjectId.trim()
    }

    const fromWebhookConfig = webhook.outboundWebhook?.providerProjectId
    if (typeof fromWebhookConfig === 'string' && fromWebhookConfig.trim().length > 0) {
      return fromWebhookConfig.trim()
    }

    return null
  }, [isJiraIntegration, webhook.outboundWebhook?.providerProjectId, webhook.selectedInboundProviderProjectId])

  const shortcutProjectMapping = useMemo(() => {
    if (!isShortcutIntegration) {
      return null
    }

    if (
      typeof webhook.selectedInboundProviderProjectId === 'string' &&
      webhook.selectedInboundProviderProjectId.trim().length > 0
    ) {
      return webhook.selectedInboundProviderProjectId.trim()
    }

    const fromWebhookConfig = webhook.outboundWebhook?.providerProjectId
    if (typeof fromWebhookConfig === 'string' && fromWebhookConfig.trim().length > 0) {
      return fromWebhookConfig.trim()
    }

    return null
  }, [isShortcutIntegration, webhook.outboundWebhook?.providerProjectId, webhook.selectedInboundProviderProjectId])

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
        const availableTypes = await getAvailableIntegrationTypes()
        if (!isActive) {
          return
        }

        const typeMap = new Map(availableTypes.map((type) => [type.id, type]))

        if (integrationSystemParam) {
          const type = typeMap.get(integrationSystemParam as TicketSystem)
          setIntegrationType(type || null)
          setExistingIntegration(null)

          // Auto-create webhook-first integrations when visiting the new page.
          if (
            (integrationSystemParam === 'custom' ||
              integrationSystemParam === 'github' ||
              integrationSystemParam === 'shortcut' ||
              integrationSystemParam === 'jira') &&
            type
          ) {
            setIsAutoCreating(true)
            try {
              const autoName = `${type.label} ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`
              const newIntegration = await createIntegration({
                name: autoName,
                system: integrationSystemParam as TicketSystem,
                config: {},
              })
              if (!isActive) {
                return
              }
              navigate(`/settings/integrations/${newIntegration.id}`, { replace: true })
              return
            } catch (error) {
              console.error('Failed to auto-create integration:', error)
              setLoadError(error instanceof Error ? error.message : 'Failed to create integration')
            } finally {
              if (isActive) {
                setIsAutoCreating(false)
              }
            }
          }
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

        // Load projects for integration-scoped project mapping controls.
        if (
          fullIntegration.system === 'custom' ||
          fullIntegration.system === 'github' ||
          fullIntegration.system === 'shortcut' ||
          fullIntegration.system === 'jira'
        ) {
          try {
            const loadedProjects = await getProjects()
            if (isActive) {
              setProjects(loadedProjects)
            }
          } catch (projectError) {
            console.error('Failed to load projects:', projectError)
          }
        } else if (isActive) {
          setProjects(null)
        }
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

  useEffect(() => {
    if (!isSlackIntegration) {
      return
    }
    getSlackBotStatus()
      .then(({ configured }) => setSlackBotConfigured(configured))
      .catch(() => setSlackBotConfigured(false))
  }, [isSlackIntegration])

  if (isPageLoading || isAutoCreating) {
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
      : isSlackIntegration
        ? slackBotConfigured
          ? 'configured'
          : 'not_configured'
        : isConfigured
          ? 'configured'
          : 'not_configured'
  const IconComponent = getIntegrationIcon(integrationType.id)
  const status = getIntegrationStatusConfig(configStatus)
  const category = getIntegrationCategoryConfig(integrationType.category)
  const StatusIcon = status.icon

  // Registry lookup — provides integration-specific section components.
  const frontendPlugin = integrationFrontendRegistry.get(integrationSystem!)
  const AuthSection = frontendPlugin?.AuthSetupSection
  const RegistryInboundSection = frontendPlugin?.InboundWebhookSection
  const RegistryOutboundSection = frontendPlugin?.OutboundWebhookSection
  const SelfManagedOutboundSection = frontendPlugin?.SelfManagedOutboundWebhookSection

  // ---- Per-system inbound handlers -------------------------------------------

  const buildGitHubInboundLabelMappings = () => {
    if (!webhook.autoExecute) {
      return {}
    }

    if (webhook.githubAutoExecuteMode === 'label_gated') {
      const requiredLabels = normalizeGitHubRequiredLabels(webhook.githubRequiredLabels)
      return {
        github: {
          autoExecuteMode: 'label_gated',
          requiredLabels,
        },
      }
    }

    return {
      github: {
        autoExecuteMode: 'matching_events',
      },
    }
  }

  const validateGitHubRepositoryMapping = (): string | null => {
    const repositoryMapping = webhook.selectedInboundProviderProjectId?.trim() || null
    if (!repositoryMapping) {
      toast.error('GitHub repository mapping is required')
      return null
    }

    if (!GITHUB_REPOSITORY_PATTERN.test(repositoryMapping)) {
      toast.error('GitHub repository mapping must use owner/repo format')
      return null
    }

    return repositoryMapping
  }

  const handleGitHubCreateInboundWebhook = () => {
    void webhook.handleCreateInboundWebhook(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
      buildGitHubInboundLabelMappings(),
    )
  }

  const handleGitHubGenerateSecret = () => {
    if (webhook.selectedInboundConfig) {
      const repositoryMapping = validateGitHubRepositoryMapping()
      if (!repositoryMapping) {
        return
      }

      void webhook.handleGenerateSecret(
        repositoryMapping,
        webhook.selectedInboundProjectId,
        buildGitHubInboundLabelMappings(),
      )
      return
    }

    void webhook.handleGenerateSecret(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
      buildGitHubInboundLabelMappings(),
    )
  }

  const handleGitHubSaveInboundWebhook = () => {
    const repositoryMapping = validateGitHubRepositoryMapping()
    if (!repositoryMapping) {
      return
    }

    if (
      webhook.githubAutoExecuteMode === 'label_gated' &&
      normalizeGitHubRequiredLabels(webhook.githubRequiredLabels).length === 0
    ) {
      toast.error('Add at least one GitHub label for label-gated auto-execute')
      return
    }

    void webhook.handleSaveInboundWebhook(
      repositoryMapping,
      webhook.selectedInboundProjectId,
      buildGitHubInboundLabelMappings(),
    )
  }

  const handleJiraCreateInboundWebhook = () => {
    void webhook.handleCreateInboundWebhook(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
    )
  }

  const handleJiraGenerateSecret = () => {
    void webhook.handleGenerateSecret(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
    )
  }

  const handleJiraSaveInboundWebhook = () => {
    void webhook.handleSaveInboundWebhook(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
    )
  }

  const handleShortcutCreateInboundWebhook = () => {
    void webhook.handleCreateInboundWebhook(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
    )
  }

  const handleShortcutGenerateSecret = () => {
    void webhook.handleGenerateSecret(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
    )
  }

  const handleShortcutSaveInboundWebhook = () => {
    void webhook.handleSaveInboundWebhook(
      webhook.selectedInboundProviderProjectId,
      webhook.selectedInboundProjectId,
    )
  }

  // Pick inbound callbacks based on integration system.
  const onCreateInboundWebhook = isGithubIntegration
    ? handleGitHubCreateInboundWebhook
    : isJiraIntegration
      ? handleJiraCreateInboundWebhook
      : isShortcutIntegration
        ? handleShortcutCreateInboundWebhook
        : () => void webhook.handleCreateInboundWebhook()

  const onGenerateInboundSecret = isGithubIntegration
    ? handleGitHubGenerateSecret
    : isJiraIntegration
      ? handleJiraGenerateSecret
      : isShortcutIntegration
        ? handleShortcutGenerateSecret
        : () => void webhook.handleGenerateSecret()

  const onSaveInboundWebhook = isGithubIntegration
    ? handleGitHubSaveInboundWebhook
    : isJiraIntegration
      ? handleJiraSaveInboundWebhook
      : isShortcutIntegration
        ? handleShortcutSaveInboundWebhook
        : () => void webhook.handleSaveInboundWebhook()

  // ---- Per-system outbound handlers ------------------------------------------

  const handleGitHubSaveOutboundWebhook = () => {
    if (!webhook.outboundWebhook?.hasApiToken && webhook.outboundApiToken.trim().length === 0) {
      toast.error('GitHub API token is required to enable outbound feedback')
      return
    }

    const repositoryMapping = githubRepositoryMapping
    if (!repositoryMapping || !GITHUB_REPOSITORY_PATTERN.test(repositoryMapping)) {
      toast.error('Save a valid GitHub inbound repository mapping before enabling feedback')
      return
    }

    void webhook.handleSaveOutboundWebhook(repositoryMapping, {
      forcedEvents: ['job_started', 'job_ended'],
      projectId: webhook.selectedInboundProjectId,
    })
  }

  const handleJiraSaveOutboundWebhook = () => {
    if (!webhook.outboundWebhook?.hasApiToken && webhook.outboundApiToken.trim().length === 0) {
      toast.error('Jira API token is required to create outbound webhook settings')
      return
    }

    void webhook.handleSaveOutboundWebhook(jiraProjectMapping, {
      forcedEvents: ['job_started', 'job_ended'],
      projectId: webhook.selectedInboundProjectId,
    })
  }

  const handleShortcutSaveOutboundWebhook = () => {
    if (!webhook.outboundWebhook?.hasApiToken && webhook.outboundApiToken.trim().length === 0) {
      toast.error('Shortcut API token is required to create outbound webhook settings')
      return
    }

    void webhook.handleSaveOutboundWebhook(shortcutProjectMapping, {
      forcedEvents: ['job_started', 'job_ended'],
    })
  }

  // Pick outbound callbacks + provider mapping based on integration system.
  const outboundProviderProjectMapping = isGithubIntegration
    ? githubRepositoryMapping
    : isJiraIntegration
      ? jiraProjectMapping
      : isShortcutIntegration
        ? shortcutProjectMapping
        : null

  const onSaveOutboundWebhook = isGithubIntegration
    ? handleGitHubSaveOutboundWebhook
    : isJiraIntegration
      ? handleJiraSaveOutboundWebhook
      : isShortcutIntegration
        ? handleShortcutSaveOutboundWebhook
        : () => void webhook.handleSaveOutboundWebhook()

  // Type-safe bridge for saveIntegrationOutboundWebhook — the SelfManagedOutboundWebhookSectionProps
  // interface uses Record<string,unknown> for the data parameter, while the API function expects a
  // specific config shape. The cast is safe because CustomOutboundWebhookSection always passes
  // a compatible data structure.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customSaveOutboundWebhook = saveIntegrationOutboundWebhook as any

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
            name: `${integrationType.label} Integration`,
            system: integrationSystem,
            config,
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

  const handleTest = async (_config: Record<string, unknown>) => {
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
        {/* Breadcrumb */}
        <div className="flex items-center gap-4">
          <Button href="/settings/integrations" plain>
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Integrations
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

        <div className="app-frame rounded-lg p-8 text-center border-amber-200 dark:border-amber-900/50">
          <StatusIcon className="mx-auto h-12 w-12 text-amber-500" />
          <h2 className="mt-4 text-lg font-semibold text-amber-900 dark:text-amber-400">Coming Soon</h2>
          <p className="mt-2 text-[var(--gray-9)]">
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
    <>
      <PageMeta title={`${integrationType.label} | Integration`} />
      <div className="space-y-8 p-6 lg:p-8">
      {/* Breadcrumb */}
      <div className="flex items-center gap-4">
        <Button href="/settings/integrations" plain>
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Integrations
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

      {/* Auth setup section (e.g. Slack install guide) */}
      {AuthSection && <AuthSection getBotStatus={getSlackBotStatus} />}

      {!isCustomIntegration && !isShortcutIntegration && !isJiraIntegration && !isGithubIntegration && !isSlackIntegration && (
        <section className="app-frame rounded-lg p-6">
          <Subheading>Configuration</Subheading>
          <div className="mt-6">
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
          </div>
        </section>
      )}

      {/* Inbound webhook section */}
      {(isConfigured || isCustomIntegration) && capabilities.supportsInboundWebhooks && (
        isCustomIntegration ? (
          <CustomInboundWebhookSection
            autoExecute={webhook.autoExecute}
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
            onAutoExecuteChange={webhook.setAutoExecute}
            onCopyWebhookSecret={webhook.handleCopyWebhookSecret}
            onCopyWebhookUrl={webhook.handleCopyWebhookUrl}
            onCreateInboundWebhook={(projectId) => webhook.handleCreateInboundWebhook(undefined, projectId)}
            onDeleteInboundWebhook={webhook.handleDeleteInboundWebhook}
            onGenerateSecret={() =>
              webhook.handleGenerateSecret(undefined, webhook.selectedInboundProjectId)
            }
            onInboundActiveChange={webhook.setInboundActive}
            onProjectChange={webhook.setSelectedInboundProjectId}
            onRefreshDeliveries={webhook.handleRefreshDeliveries}
            onRetryDelivery={webhook.handleRetryDelivery}
            onSaveWebhook={() => webhook.handleSaveInboundWebhook(undefined, webhook.selectedInboundProjectId)}
            onSelectInboundWebhook={webhook.handleSelectInboundWebhook}
            onToggleSecretVisibility={() => webhook.setShowSecret(!webhook.showSecret)}
          />
        ) : RegistryInboundSection ? (
          <RegistryInboundSection
            autoExecute={webhook.autoExecute}
            deliveries={webhook.deliveries}
            hasInboundChanges={webhook.hasInboundChanges}
            inboundEvents={webhook.inboundEvents}
            inboundWebhooks={webhook.inboundWebhooks}
            isLoadingDeliveries={webhook.isLoadingDeliveries}
            isLoadingWebhook={webhook.isLoadingWebhook}
            isSavingWebhook={webhook.isSavingWebhook}
            projects={projects}
            selectedInboundConfig={webhook.selectedInboundConfig}
            selectedInboundConfigId={webhook.selectedInboundConfigId}
            selectedInboundProjectId={webhook.selectedInboundProjectId}
            selectedInboundProviderProjectId={webhook.selectedInboundProviderProjectId}
            showSecret={webhook.showSecret}
            githubAutoExecuteMode={webhook.githubAutoExecuteMode}
            githubRequiredLabels={webhook.githubRequiredLabels}
            onAutoExecuteChange={webhook.setAutoExecute}
            onCopyWebhookSecret={webhook.handleCopyWebhookSecret}
            onCopyWebhookUrl={webhook.handleCopyWebhookUrl}
            onCreateInboundWebhook={onCreateInboundWebhook}
            onDeleteInboundWebhook={webhook.handleDeleteInboundWebhook}
            onGenerateSecret={onGenerateInboundSecret}
            onGitHubAutoExecuteModeChange={webhook.setGitHubAutoExecuteMode}
            onGitHubRequiredLabelsChange={webhook.setGitHubRequiredLabels}
            onInboundProjectChange={webhook.setSelectedInboundProjectId}
            onProviderProjectIdChange={webhook.setSelectedInboundProviderProjectId}
            onRefreshDeliveries={webhook.handleRefreshDeliveries}
            onRetryDelivery={webhook.handleRetryDelivery}
            onSaveWebhook={onSaveInboundWebhook}
            onSelectInboundWebhook={webhook.handleSelectInboundWebhook}
            onToggleInboundEvent={webhook.handleToggleInboundEvent}
            onToggleSecretVisibility={() => webhook.setShowSecret(!webhook.showSecret)}
          />
        ) : (
          <InboundWebhookSection
            autoExecute={webhook.autoExecute}
            deliveries={webhook.deliveries}
            hasInboundChanges={webhook.hasInboundChanges}
            inboundWebhooks={webhook.inboundWebhooks}
            isLoadingDeliveries={webhook.isLoadingDeliveries}
            isLoadingWebhook={webhook.isLoadingWebhook}
            isSavingWebhook={webhook.isSavingWebhook}
            projects={projects}
            selectedInboundConfig={webhook.selectedInboundConfig}
            selectedInboundConfigId={webhook.selectedInboundConfigId}
            showCustomPayloadHelp={capabilities.showCustomInboundPayloadHelp}
            showSecret={webhook.showSecret}
            onAutoExecuteChange={webhook.setAutoExecute}
            onCopyWebhookUrl={webhook.handleCopyWebhookUrl}
            onCreateInboundWebhook={() => webhook.handleCreateInboundWebhook()}
            onDeleteInboundWebhook={webhook.handleDeleteInboundWebhook}
            onGenerateSecret={() => webhook.handleGenerateSecret()}
            onRefreshDeliveries={webhook.handleRefreshDeliveries}
            onRetryDelivery={webhook.handleRetryDelivery}
            onSaveWebhook={() => webhook.handleSaveInboundWebhook()}
            onSelectInboundWebhook={webhook.handleSelectInboundWebhook}
            onToggleSecretVisibility={() => webhook.setShowSecret(!webhook.showSecret)}
          />
        )
      )}

      {isConfigured && existingIntegration && (isGithubIntegration || integrationSystem === 'gitlab' || integrationSystem === 'bitbucket') && (
        <IntegrationCredentialSection
          integrationId={existingIntegration.id}
          integrationSystem={integrationSystem}
        />
      )}

      {/* Outbound webhook section */}
      {(isConfigured || isCustomIntegration) && capabilities.supportsOutboundWebhooks && (
        SelfManagedOutboundSection ? (
          // Custom integration: section manages its own state and calls the API directly.
          <SelfManagedOutboundSection
            integrationEntityId={integrationEntityId}
            projects={projects}
            onGetOutboundWebhooks={getIntegrationOutboundWebhooks}
            onSaveOutboundWebhook={customSaveOutboundWebhook}
            onDeleteOutboundWebhook={deleteIntegrationOutboundWebhook}
            onTestOutboundWebhook={testIntegrationOutboundWebhook}
          />
        ) : RegistryOutboundSection ? (
          // Integration-specific controlled outbound section (GitHub, Jira, Shortcut, etc.).
          <RegistryOutboundSection
            isSavingWebhook={webhook.isSavingWebhook}
            outboundApiToken={webhook.outboundApiToken}
            outboundWebhook={webhook.outboundWebhook}
            providerProjectMapping={outboundProviderProjectMapping}
            onOutboundApiTokenChange={webhook.setOutboundApiToken}
            onSaveOutboundWebhook={onSaveOutboundWebhook}
          />
        ) : (
          // Generic outbound section for integrations without a custom implementation.
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
        )
      )}
    </div>
    </>
  )
}
