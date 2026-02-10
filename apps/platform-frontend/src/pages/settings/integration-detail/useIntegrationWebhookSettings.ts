import {
  createIntegrationInboundWebhook,
  deleteIntegrationInboundWebhook,
  deleteIntegrationOutboundWebhook,
  getIntegrationDeliveries,
  getIntegrationInboundWebhooks,
  getIntegrationOutboundWebhook,
  retryIntegrationDelivery,
  saveIntegrationOutboundWebhook,
  updateIntegrationInboundWebhook,
  type IntegrationInboundWebhookConfig,
  type IntegrationOutboundWebhookConfig,
  type IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

interface UseIntegrationWebhookSettingsArgs {
  integrationEntityId?: string
}

export function useIntegrationWebhookSettings({
  integrationEntityId,
}: UseIntegrationWebhookSettingsArgs) {
  const [inboundWebhooks, setInboundWebhooks] = useState<IntegrationInboundWebhookConfig[]>([])
  const [selectedInboundConfigId, setSelectedInboundConfigId] = useState<string | null>(null)
  const [outboundWebhook, setOutboundWebhook] = useState<IntegrationOutboundWebhookConfig | null>(null)
  const [isLoadingWebhook, setIsLoadingWebhook] = useState(false)
  const [showSecret, setShowSecret] = useState(false)
  const [deliveries, setDeliveries] = useState<IntegrationWebhookDelivery[]>([])
  const [isLoadingDeliveries, setIsLoadingDeliveries] = useState(false)
  const [autoExecute, setAutoExecute] = useState(false)
  const [emitJobStarted, setEmitJobStarted] = useState(true)
  const [emitJobEnded, setEmitJobEnded] = useState(true)
  const [outboundApiToken, setOutboundApiToken] = useState('')
  const [isSavingWebhook, setIsSavingWebhook] = useState(false)

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
        setOutboundWebhook(null)
        setDeliveries([])
        setShowSecret(false)
        setAutoExecute(false)
        setEmitJobStarted(true)
        setEmitJobEnded(true)
        setOutboundApiToken('')
        return
      }

      setIsLoadingWebhook(true)
      try {
        const [inboundConfigs, outboundConfig] = await Promise.all([
          getIntegrationInboundWebhooks(integrationEntityId),
          getIntegrationOutboundWebhook(integrationEntityId),
        ])

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

        setOutboundWebhook(outboundConfig)

        const selectedInbound = inboundConfigs[0]
        if (selectedInbound) {
          setAutoExecute(selectedInbound.autoExecute)
        }

        if (outboundConfig) {
          const enabled = new Set(outboundConfig.events)
          setEmitJobStarted(enabled.has('job_started'))
          setEmitJobEnded(enabled.has('job_ended'))
        } else {
          setEmitJobStarted(true)
          setEmitJobEnded(true)
        }

        setOutboundApiToken('')
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
      setAutoExecute(selectedInboundConfig.autoExecute)
    }
  }, [selectedInboundConfig])

  const loadDeliveriesForConfig = useCallback(
    async (
      targetIntegrationEntityId: string,
      targetInboundConfigId: string,
      showLoadingState: boolean
    ) => {
      if (showLoadingState) {
        setIsLoadingDeliveries(true)
      }

      try {
        const data = await getIntegrationDeliveries(
          targetIntegrationEntityId,
          targetInboundConfigId
        )
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

  const handleGenerateSecret = async () => {
    if (!integrationEntityId) {
      return
    }

    setIsSavingWebhook(true)
    try {
      const config = selectedInboundConfig
        ? await updateIntegrationInboundWebhook(integrationEntityId, selectedInboundConfig.id, {
            generateSecret: true,
            autoExecute,
          })
        : await createIntegrationInboundWebhook(integrationEntityId, {
            generateSecret: true,
            autoExecute: false,
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

  const handleCreateInboundWebhook = async () => {
    if (!integrationEntityId) {
      return
    }

    setIsSavingWebhook(true)
    try {
      const config = await createIntegrationInboundWebhook(integrationEntityId, {
        generateSecret: true,
        autoExecute: false,
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

  const handleSaveInboundWebhook = async () => {
    if (!integrationEntityId || !selectedInboundConfig) {
      return
    }

    setIsSavingWebhook(true)
    try {
      const config = await updateIntegrationInboundWebhook(
        integrationEntityId,
        selectedInboundConfig.id,
        {
          autoExecute,
        }
      )
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

  const handleSaveOutboundWebhook = async () => {
    if (!integrationEntityId) {
      return
    }

    const events: string[] = []
    if (emitJobStarted) {
      events.push('job_started')
    }
    if (emitJobEnded) {
      events.push('job_ended')
    }

    setIsSavingWebhook(true)
    try {
      const config = await saveIntegrationOutboundWebhook(
        integrationEntityId,
        {
          events,
          apiToken: outboundApiToken.trim() || undefined,
        },
        outboundWebhook?.id
      )
      setOutboundWebhook(config)
      setOutboundApiToken('')
      toast.success('Outbound webhook settings saved')
    } catch (error) {
      console.error('Failed to save outbound webhook:', error)
      toast.error('Failed to save outbound webhook settings', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsSavingWebhook(false)
    }
  }

  const handleDeleteOutboundWebhook = async () => {
    if (!integrationEntityId || !outboundWebhook) {
      return
    }

    if (!window.confirm('Are you sure you want to remove outbound webhook events?')) {
      return
    }

    setIsSavingWebhook(true)
    try {
      await deleteIntegrationOutboundWebhook(integrationEntityId, outboundWebhook.id)
      setOutboundWebhook(null)
      setEmitJobStarted(true)
      setEmitJobEnded(true)
      setOutboundApiToken('')
      toast.success('Outbound webhook removed successfully')
    } catch (error) {
      console.error('Failed to delete outbound webhook:', error)
      toast.error('Failed to remove outbound webhook', {
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
      await retryIntegrationDelivery(
        integrationEntityId,
        selectedInboundConfig.id,
        deliveryId
      )
      toast.success('Delivery retry initiated')
      void handleRefreshDeliveries()
    } catch (error) {
      console.error('Failed to retry delivery:', error)
      toast.error('Failed to retry delivery')
    }
  }

  const hasInboundChanges = selectedInboundConfig
    ? autoExecute !== selectedInboundConfig.autoExecute
    : false

  const hasOutboundChanges = outboundWebhook
    ? emitJobStarted !== outboundWebhook.events.includes('job_started') ||
      emitJobEnded !== outboundWebhook.events.includes('job_ended') ||
      outboundApiToken.trim().length > 0
    : emitJobStarted !== true || emitJobEnded !== true || outboundApiToken.trim().length > 0

  return {
    autoExecute,
    deliveries,
    emitJobEnded,
    emitJobStarted,
    hasInboundChanges,
    hasOutboundChanges,
    inboundWebhooks,
    isLoadingDeliveries,
    isLoadingWebhook,
    isSavingWebhook,
    outboundApiToken,
    outboundWebhook,
    selectedInboundConfig,
    selectedInboundConfigId,
    showSecret,
    setAutoExecute,
    setEmitJobEnded,
    setEmitJobStarted,
    setOutboundApiToken,
    setShowSecret,
    handleCopyWebhookUrl,
    handleCreateInboundWebhook,
    handleDeleteInboundWebhook,
    handleDeleteOutboundWebhook,
    handleGenerateSecret,
    handleRefreshDeliveries,
    handleRetryDelivery,
    handleSaveInboundWebhook,
    handleSaveOutboundWebhook,
    handleSelectInboundWebhook,
  }
}
