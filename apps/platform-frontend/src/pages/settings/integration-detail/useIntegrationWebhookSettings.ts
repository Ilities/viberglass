import {
  createIntegrationInboundWebhook,
  deleteIntegrationInboundWebhook,
  getIntegrationDeliveries,
  getIntegrationInboundWebhooks,
  retryIntegrationDelivery,
  updateIntegrationInboundWebhook,
  type IntegrationInboundWebhookConfig,
  type IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface UseIntegrationWebhookSettingsArgs {
  integrationEntityId?: string
}

type GitHubPlanNewIssuesMode = 'matching_events' | 'label_gated'

function areEventListsEqual(left: string[], right: string[]): boolean {
  const normalizedLeft = Array.from(new Set(left)).sort()
  const normalizedRight = Array.from(new Set(right)).sort()

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((event, index) => event === normalizedRight[index])
}

function areStringListsEqual(left: string[], right: string[]): boolean {
  const normalizedLeft = Array.from(new Set(left.map((value) => value.trim().toLowerCase()).filter(Boolean))).sort()
  const normalizedRight = Array.from(
    new Set(right.map((value) => value.trim().toLowerCase()).filter(Boolean))
  ).sort()

  if (normalizedLeft.length !== normalizedRight.length) {
    return false
  }

  return normalizedLeft.every((value, index) => value === normalizedRight[index])
}

function normalizeGitHubRequiredLabels(rawLabels: unknown): string[] {
  if (!Array.isArray(rawLabels)) {
    return []
  }

  const normalizedLabels: string[] = []
  for (const label of rawLabels) {
    if (typeof label !== 'string') {
      continue
    }

    const normalized = label.trim().toLowerCase()
    if (!normalized || normalizedLabels.includes(normalized)) {
      continue
    }
    normalizedLabels.push(normalized)
  }

  return normalizedLabels
}

function parseGitHubPlanNewIssuesSettings(labelMappings?: Record<string, unknown> | null): {
  mode: GitHubPlanNewIssuesMode
  requiredLabels: string[]
} {
  if (!labelMappings || typeof labelMappings !== 'object' || Array.isArray(labelMappings)) {
    return { mode: 'matching_events', requiredLabels: [] }
  }

  const nested =
    typeof labelMappings.github === 'object' && labelMappings.github !== null && !Array.isArray(labelMappings.github)
      ? (labelMappings.github as Record<string, unknown>)
      : labelMappings

  const mode =
    nested.planNewIssuesMode === 'label_gated'
      ? 'label_gated'
      : 'matching_events'

  return {
    mode,
    requiredLabels: normalizeGitHubRequiredLabels(nested.requiredLabels ?? nested.labels),
  }
}

export function useIntegrationWebhookSettings({ integrationEntityId }: UseIntegrationWebhookSettingsArgs) {
  const [inboundWebhooks, setInboundWebhooks] = useState<IntegrationInboundWebhookConfig[]>([])
  const [selectedInboundConfigId, setSelectedInboundConfigId] = useState<string | null>(null)
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [deliveries, setDeliveries] = useState<IntegrationWebhookDelivery[]>([])
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false)
  const [planNewIssues, setPlanNewIssues] = useState(false)
  const [botUsername, setBotUsername] = useState('')
  const [inboundActive, setInboundActive] = useState(true)
  const [inboundEvents, setInboundEvents] = useState<string[]>([])
  const [isSavingWebhook, setIsSavingWebhook] = useState(false)
  const [selectedInboundProjectId, setSelectedInboundProjectId] = useState<string | null>(null)
  const [selectedInboundProviderProjectId, setSelectedInboundProviderProjectId] = useState<string | null>(null)
  const [githubPlanNewIssuesMode, setGitHubPlanNewIssuesMode] = useState<GitHubPlanNewIssuesMode>('matching_events')
  const [githubRequiredLabels, setGitHubRequiredLabels] = useState<string[]>([])

  const selectedInboundConfig = useMemo(
    () => inboundWebhooks.find((config) => config.id === selectedInboundConfigId) || null,
    [inboundWebhooks, selectedInboundConfigId]
  )

  useEffect(() => {
    let isActive = true

    async function loadWebhookData() {
      if (!integrationEntityId) {
        setIsLoadingWebhook(false)
        setInboundWebhooks([])
        setSelectedInboundConfigId(null)
        setDeliveries([])
        setShowSecret(false)
        setPlanNewIssues(false)
        setBotUsername('')
        setInboundActive(true)
        setInboundEvents([])
        setSelectedInboundProjectId(null)
        setSelectedInboundProviderProjectId(null)
        setGitHubPlanNewIssuesMode('matching_events')
        setGitHubRequiredLabels([])
        return
      }

      setIsLoadingWebhook(true)
      try {
        const inboundConfigs = await getIntegrationInboundWebhooks(integrationEntityId)

        if (!isActive) {
          return
        }

        setInboundWebhooks(inboundConfigs)
        setSelectedInboundConfigId((current) => {
          if (current && inboundConfigs.some((config) => config.id === current)) {
            return current
          }
          return inboundConfigs[0]?.id || null
        })

        setInboundEvents(inboundConfigs[0]?.events || [])
        setShowSecret(false)
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
  }, [integrationEntityId])

  useEffect(() => {
    if (selectedInboundConfig) {
      setPlanNewIssues(selectedInboundConfig.planNewIssues)
      setBotUsername(selectedInboundConfig.botUsername ?? '')
      setInboundActive(selectedInboundConfig.active)
      setInboundEvents(selectedInboundConfig.events)
      setSelectedInboundProjectId(selectedInboundConfig.projectId ?? null)
      setSelectedInboundProviderProjectId(selectedInboundConfig.providerProjectId ?? null)
      const planNewIssuesSettings = parseGitHubPlanNewIssuesSettings(selectedInboundConfig.labelMappings)
      setGitHubPlanNewIssuesMode(planNewIssuesSettings.mode)
      setGitHubRequiredLabels(planNewIssuesSettings.requiredLabels)
    } else {
      setPlanNewIssues(false)
      setBotUsername('')
      setInboundActive(true)
      setInboundEvents([])
      setSelectedInboundProjectId(null)
      setSelectedInboundProviderProjectId(null)
      setGitHubPlanNewIssuesMode('matching_events')
      setGitHubRequiredLabels([])
    }
  }, [selectedInboundConfig])

  const loadDeliveriesForConfig = useCallback(
    async (targetIntegrationEntityId: string, targetInboundConfigId: string, showLoadingState: boolean) => {
      if (showLoadingState) {
        setIsLoadingDeliveries(true)
      }

      try {
        const data = await getIntegrationDeliveries(targetIntegrationEntityId, targetInboundConfigId)
        setDeliveries(data)
      } catch (error) {
        console.error('Failed to load deliveries:', error)
        setDeliveries([])
      } finally {
        if (showLoadingState) {
          setIsLoadingDeliveries(false)
        }
      }
    },
    []
  )

  useEffect(() => {
    if (!integrationEntityId || !selectedInboundConfigId) {
      setDeliveries([])
      return
    }

    void loadDeliveriesForConfig(integrationEntityId, selectedInboundConfigId, false)
  }, [integrationEntityId, loadDeliveriesForConfig, selectedInboundConfigId])

  const handleGenerateSecret = async (
    providerProjectId?: string | null,
    projectId?: string | null,
    labelMappings?: Record<string, unknown>
  ) => {
    if (!integrationEntityId) {
      return
    }

    if (selectedInboundConfig && inboundEvents.length === 0) {
      toast.error('Select at least one inbound event')
      return
    }

    setIsSavingWebhook(true)
    try {
      const config = selectedInboundConfig
        ? await updateIntegrationInboundWebhook(integrationEntityId, selectedInboundConfig.id, {
            generateSecret: true,
            events: inboundEvents,
            planNewIssues,
            botUsername: botUsername.trim() || null,
            active: inboundActive,
            providerProjectId,
            projectId,
            labelMappings,
          })
        : await createIntegrationInboundWebhook(integrationEntityId, {
            generateSecret: true,
            events: inboundEvents.length > 0 ? inboundEvents : undefined,
            planNewIssues: false,
            active: true,
            providerProjectId,
            projectId,
            labelMappings,
          })

      setInboundWebhooks((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === config.id)
        if (existingIndex >= 0) {
          return prev.map((item) => (item.id === config.id ? config : item))
        }
        return [...prev, config]
      })

      setSelectedInboundConfigId(config.id)
      toast.success('Inbound webhook configured successfully')
    } catch (error) {
      console.error('Failed to generate webhook secret:', error)
      toast.error('Failed to setup inbound webhook', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleCreateInboundWebhook = async (
    providerProjectId?: string | null,
    projectId?: string | null,
    labelMappings?: Record<string, unknown>
  ) => {
    if (!integrationEntityId) {
      return
    }

    setIsSavingWebhook(true)
    try {
      const config = await createIntegrationInboundWebhook(integrationEntityId, {
        generateSecret: true,
        planNewIssues: false,
        active: true,
        providerProjectId,
        projectId,
        labelMappings,
      })
      setInboundWebhooks((prev) => [...prev, config])
      setSelectedInboundConfigId(config.id)
      toast.success('Inbound webhook created')
    } catch (error) {
      console.error('Failed to create inbound webhook:', error)
      toast.error('Failed to create inbound webhook', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleSaveInboundWebhook = async (
    providerProjectId?: string | null,
    projectId?: string | null,
    labelMappings?: Record<string, unknown>
  ) => {
    if (!integrationEntityId || !selectedInboundConfig) {
      return
    }

    if (inboundEvents.length === 0) {
      toast.error('Select at least one inbound event')
      return
    }

    setIsSavingWebhook(true)
    try {
      const config = await updateIntegrationInboundWebhook(integrationEntityId, selectedInboundConfig.id, {
        events: inboundEvents,
        planNewIssues,
        botUsername: botUsername.trim() || null,
        active: inboundActive,
        providerProjectId,
        projectId,
        labelMappings,
      })
      setInboundWebhooks((prev) => prev.map((item) => (item.id === config.id ? config : item)))
      toast.success('Inbound webhook settings saved')
    } catch (error) {
      console.error('Failed to save inbound webhook config:', error)
      toast.error('Failed to save inbound webhook settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleDeleteInboundWebhook = async () => {
    if (!integrationEntityId || !selectedInboundConfig) {
      return
    }

    if (!window.confirm('Are you sure you want to remove this inbound webhook configuration?')) {
      return
    }

    setIsSavingWebhook(true)
    try {
      const removedId = selectedInboundConfig.id
      await deleteIntegrationInboundWebhook(integrationEntityId, removedId)

      const nextConfigs = inboundWebhooks.filter((item) => item.id !== removedId)
      setInboundWebhooks(nextConfigs)
      setSelectedInboundConfigId(nextConfigs[0]?.id || null)
      toast.success('Inbound webhook removed successfully')
    } catch (error) {
      console.error('Failed to delete inbound webhook:', error)
      toast.error('Failed to remove inbound webhook', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleSelectInboundWebhook = (configId: string) => {
    setSelectedInboundConfigId(configId)
    setShowSecret(false)
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

  const handleCopyWebhookSecret = async () => {
    if (!selectedInboundConfig?.webhookSecret) {
      toast.error('Webhook secret is hidden. Regenerate it to copy a new value.')
      return
    }

    try {
      await navigator.clipboard.writeText(selectedInboundConfig.webhookSecret)
      toast.success('Webhook secret copied to clipboard')
    } catch (error) {
      console.error('Failed to copy secret:', error)
      toast.error('Failed to copy webhook secret')
    }
  }

  const handleToggleInboundEvent = (eventType: string, enabled: boolean) => {
    setInboundEvents((previous) => {
      if (enabled) {
        if (previous.includes(eventType)) {
          return previous
        }
        return [...previous, eventType]
      }

      return previous.filter((event) => event !== eventType)
    })
  }

  const handleRefreshDeliveries = async () => {
    if (!integrationEntityId || !selectedInboundConfig) {
      setDeliveries([])
      return
    }

    try {
      await loadDeliveriesForConfig(integrationEntityId, selectedInboundConfig.id, true)
    } catch (error) {
      console.error('Failed to refresh deliveries:', error)
      toast.error('Failed to refresh deliveries')
    }
  }

  const handleRetryDelivery = async (deliveryId: string) => {
    if (!integrationEntityId || !selectedInboundConfig) {
      return
    }

    try {
      const result = await retryIntegrationDelivery(integrationEntityId, selectedInboundConfig.id, deliveryId)
      toast.success(
        result.retry.status === 'processed' ? 'Delivery retried successfully' : 'Delivery retry completed',
        {
          description: result.retry.reason,
        }
      )
      void handleRefreshDeliveries()
    } catch (error) {
      console.error('Failed to retry delivery:', error)
      toast.error('Failed to retry delivery', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  const selectedInboundPlanNewIssuesSettings = parseGitHubPlanNewIssuesSettings(selectedInboundConfig?.labelMappings)

  const hasInboundChanges = selectedInboundConfig
    ? planNewIssues !== selectedInboundConfig.planNewIssues ||
      botUsername.trim() !== (selectedInboundConfig.botUsername ?? '') ||
      inboundActive !== selectedInboundConfig.active ||
      !areEventListsEqual(inboundEvents, selectedInboundConfig.events) ||
      selectedInboundProjectId !== (selectedInboundConfig.projectId ?? null) ||
      selectedInboundProviderProjectId !== (selectedInboundConfig.providerProjectId ?? null) ||
      githubPlanNewIssuesMode !== selectedInboundPlanNewIssuesSettings.mode ||
      !areStringListsEqual(githubRequiredLabels, selectedInboundPlanNewIssuesSettings.requiredLabels)
    : false

  return {
    planNewIssues,
    botUsername,
    deliveries,
    githubPlanNewIssuesMode,
    githubRequiredLabels,
    hasInboundChanges,
    inboundActive,
    inboundEvents,
    inboundWebhooks,
    isLoadingDeliveries,
    isLoadingWebhook,
    isSavingWebhook,
    selectedInboundConfig,
    selectedInboundConfigId,
    selectedInboundProviderProjectId,
    selectedInboundProjectId,
    showSecret,
    setPlanNewIssues,
    setBotUsername,
    setGitHubPlanNewIssuesMode,
    setGitHubRequiredLabels,
    setInboundActive,
    setSelectedInboundProviderProjectId,
    setSelectedInboundProjectId,
    setShowSecret,
    handleCopyWebhookSecret,
    handleCopyWebhookUrl,
    handleCreateInboundWebhook,
    handleDeleteInboundWebhook,
    handleGenerateSecret,
    handleRefreshDeliveries,
    handleRetryDelivery,
    handleSaveInboundWebhook,
    handleSelectInboundWebhook,
    handleToggleInboundEvent,
  }
}
