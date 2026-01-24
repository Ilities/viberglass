'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Heading, Subheading } from '@/components/heading'
import { Button } from '@/components/button'
import { Badge } from '@/components/badge'
import { Divider } from '@/components/divider'
import {
  Alert,
  AlertActions,
  AlertBody,
  AlertDescription,
  AlertTitle,
} from '@/components/alert'
import {
  getWebhookConfigs,
  createWebhookConfig,
  updateWebhookConfig,
  deleteWebhookConfig,
  testWebhookConfig,
  getFailedDeliveries,
  retryDelivery,
  type WebhookConfig,
  type WebhookDelivery,
} from '@/service/api/webhook-api'
import { WebhookDeliveryList, DeliverySummary } from '@/components/webhook-delivery-list'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  BeakerIcon,
  ChevronDownIcon,
  ChevronRightIcon,
} from '@heroicons/react/16/solid'

export default function WebhooksPage() {
  const router = useRouter()
  const [configs, setConfigs] = useState<WebhookConfig[]>([])
  const [failedDeliveries, setFailedDeliveries] = useState<WebhookDelivery[]>([])
  const [loading, setLoading] = useState(true)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [configToDelete, setConfigToDelete] = useState<WebhookConfig | null>(null)
  const [showFailedDeliveries, setShowFailedDeliveries] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    try {
      const [configsData, deliveriesData] = await Promise.all([
        getWebhookConfigs(),
        getFailedDeliveries(100),
      ])
      setConfigs(configsData)
      setFailedDeliveries(deliveriesData)
    } catch (error) {
      console.error('Failed to load webhook data:', error)
      toast.error('Failed to load webhook configurations')
    } finally {
      setLoading(false)
    }
  }

  async function handleTest(configId: string) {
    setTestingId(configId)
    try {
      const result = await testWebhookConfig(configId)
      if (result.success) {
        toast.success('Test successful', {
          description: result.message,
        })
      } else {
        toast.error('Test failed', {
          description: result.message,
        })
      }
    } catch (error) {
      toast.error('Test failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setTestingId(null)
    }
  }

  async function handleDelete(config: WebhookConfig) {
    setConfigToDelete(config)
    setDeleteDialogOpen(true)
  }

  async function confirmDelete() {
    if (!configToDelete) return

    setDeletingId(configToDelete.id)
    try {
      await deleteWebhookConfig(configToDelete.id)
      toast.success('Configuration deleted', {
        description: 'Webhook configuration has been removed.',
      })
      setConfigs((prev) => prev.filter((c) => c.id !== configToDelete.id))
    } catch (error) {
      toast.error('Delete failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setDeletingId(null)
      setDeleteDialogOpen(false)
      setConfigToDelete(null)
    }
  }

  async function handleRetryDelivery(deliveryId: string) {
    try {
      const result = await retryDelivery(deliveryId)
      if (result.success) {
        toast.success('Retry successful', {
          description: result.message,
        })
        // Reload deliveries
        const updatedDeliveries = await getFailedDeliveries(100)
        setFailedDeliveries(updatedDeliveries)
      } else {
        toast.error('Retry failed', {
          description: result.message,
        })
      }
    } catch (error) {
      toast.error('Retry failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    }
  }

  function getProviderColor(provider: string): 'blue' | 'zinc' {
    return provider === 'github' ? 'zinc' : 'blue'
  }

  function getStatusColor(active: boolean): 'green' | 'zinc' {
    return active ? 'green' : 'zinc'
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Heading>Webhook Configurations</Heading>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Configure webhook providers to receive events from GitHub, Jira, and other platforms.
          </p>
        </div>
        <Button color="brand" onClick={() => router.push('/webhooks/config/new')}>
          <PlusIcon />
          Add Configuration
        </Button>
      </div>

      {/* Failed Deliveries Summary */}
      {failedDeliveries.length > 0 && !showFailedDeliveries && (
        <DeliverySummary
          failedCount={failedDeliveries.length}
          onRetryAll={async () => {
            for (const delivery of failedDeliveries) {
              await handleRetryDelivery(delivery.id)
            }
          }}
        />
      )}

      {/* Configuration List */}
      <Subheading>Configurations</Subheading>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-zinc-500 dark:text-zinc-400">Loading...</div>
        </div>
      ) : configs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <h3 className="text-lg font-semibold text-zinc-950 dark:text-white">No configurations yet</h3>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
            Create your first webhook configuration to start receiving events from external platforms.
          </p>
          <Button color="brand" className="mt-6" onClick={() => router.push('/webhooks/config/new')}>
            <PlusIcon />
            Create Configuration
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {configs.map((config) => (
            <div
              key={config.id}
              className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <Badge color={getProviderColor(config.provider)}>
                    {config.provider === 'github' ? 'GitHub' : 'Jira'}
                  </Badge>
                  <Badge color={getStatusColor(config.active)}>
                    {config.active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    plain
                    onClick={() => router.push(`/webhooks/config/${config.id}/edit`)}
                    className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
                  >
                    <PencilIcon className="h-4 w-4" />
                  </Button>
                  <Button
                    plain
                    onClick={() => handleDelete(config)}
                    className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="mt-4">
                <h4 className="text-base font-semibold text-zinc-950 dark:text-white">
                  {config.providerProjectId || 'No project configured'}
                </h4>
                {config.botUsername && (
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Bot: @{config.botUsername}
                  </p>
                )}
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {config.allowedEvents.slice(0, 3).map((event) => (
                  <span
                    key={event}
                    className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                  >
                    {event}
                  </span>
                ))}
                {config.allowedEvents.length > 3 && (
                  <span className="rounded bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    +{config.allowedEvents.length - 3} more
                  </span>
                )}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-zinc-100 pt-4 dark:border-zinc-700">
                <div className="flex items-center gap-4">
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Auto-execute</p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">
                      {config.autoExecute ? 'Yes' : 'No'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">Secret location</p>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white capitalize">
                      {config.secretLocation}
                    </p>
                  </div>
                </div>
                <Button
                  plain
                  onClick={() => handleTest(config.id)}
                  disabled={testingId === config.id}
                  className="text-sm"
                >
                  <BeakerIcon className="h-4 w-4" />
                  Test
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Failed Deliveries Section */}
      <Divider className="my-8" soft />

      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setShowFailedDeliveries(!showFailedDeliveries)}
          className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-white"
        >
          {showFailedDeliveries ? (
            <ChevronDownIcon className="h-5 w-5" />
          ) : (
            <ChevronRightIcon className="h-5 w-5" />
          )}
          Failed Deliveries ({failedDeliveries.length})
        </button>

        {showFailedDeliveries && (
          <WebhookDeliveryList
            deliveries={failedDeliveries}
            onRetry={handleRetryDelivery}
            onRefresh={async () => {
              const updated = await getFailedDeliveries(100)
              setFailedDeliveries(updated)
            }}
          />
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <Alert open={deleteDialogOpen} onClose={setDeleteDialogOpen}>
        <AlertTitle>Delete webhook configuration?</AlertTitle>
        <AlertDescription>
          Are you sure you want to delete the webhook configuration for{' '}
          <strong>{configToDelete?.providerProjectId}</strong>? This action cannot be undone.
        </AlertDescription>
        <AlertBody>
          Webhooks from this source will no longer be processed.
        </AlertBody>
        <AlertActions>
          <Button plain onClick={() => setDeleteDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            color="red"
            onClick={confirmDelete}
            disabled={deletingId === configToDelete?.id}
          >
            {deletingId === configToDelete?.id ? 'Deleting...' : 'Delete'}
          </Button>
        </AlertActions>
      </Alert>
    </div>
  )
}
