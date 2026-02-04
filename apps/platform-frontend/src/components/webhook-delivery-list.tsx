import { useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Table, TableHead, TableBody, TableRow, TableHeader, TableCell } from '@/components/table'
import { Text } from '@/components/text'
import { ChevronDownIcon, ReloadIcon } from '@radix-ui/react-icons'
import { usePolling } from '@/hooks/usePolling'
import type { WebhookDelivery, WebhookDeliveryStatus } from '@/service/api/webhook-api'

interface WebhookDeliveryListProps {
  deliveries: WebhookDelivery[]
  onRetry: (deliveryId: string) => Promise<void>
  loading?: boolean
  onRefresh?: () => Promise<void>
}

type StatusFilter = 'all' | 'pending' | 'processing' | 'failed' | 'succeeded'

const STATUS_COLORS: Record<WebhookDeliveryStatus, 'red' | 'amber' | 'green' | 'zinc'> = {
  pending: 'amber',
  processing: 'amber',
  succeeded: 'green',
  failed: 'red',
}

const PROVIDER_COLORS: Record<'github' | 'jira', 'zinc' | 'blue'> = {
  github: 'zinc',
  jira: 'blue',
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const seconds = Math.floor(diff / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (seconds < 60) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  return `${days}d ago`
}

function formatEventName(event: string): string {
  return event
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function WebhookDeliveryList({
  deliveries: initialDeliveries,
  onRetry,
  loading = false,
  onRefresh,
}: WebhookDeliveryListProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('failed')
  const [retryingDelivery, setRetryingDelivery] = useState<string | null>(null)

  // Poll for updates when showing failed deliveries
  const { data: polledData, isPolling } = usePolling({
    fn: async () => {
      if (onRefresh && statusFilter === 'failed') {
        await onRefresh()
      }
      return initialDeliveries
    },
    interval: 10000, // 10 seconds
    enabled: statusFilter === 'failed' && !loading,
    immediate: false,
  })

  const deliveries = polledData || initialDeliveries

  const filteredDeliveries = deliveries.filter((delivery) => {
    if (statusFilter === 'all') return true
    return delivery.status === statusFilter
  })

  const failedCount = deliveries.filter((d) => d.status === 'failed').length

  async function handleRetry(deliveryId: string) {
    setRetryingDelivery(deliveryId)
    try {
      await onRetry(deliveryId)
      toast.success('Retry queued', {
        description: 'The webhook delivery will be reprocessed.',
      })
    } catch (error) {
      toast.error('Retry failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setRetryingDelivery(null)
    }
  }

  if (deliveries.length === 0 && !loading) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-12 text-center dark:border-zinc-700 dark:bg-zinc-900">
        <Text className="text-lg font-semibold text-zinc-950 dark:text-white">
          No webhook deliveries
        </Text>
        <Text className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          Webhook delivery history will appear here once webhooks are received.
        </Text>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Text className="text-sm font-medium text-zinc-950 dark:text-white">
            Status:
          </Text>
          <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
            {(['all', 'pending', 'processing', 'failed', 'succeeded'] as StatusFilter[]).map(
              (filter) => {
                const count =
                  filter === 'all'
                    ? deliveries.length
                    : deliveries.filter((d) => d.status === filter).length
                return (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setStatusFilter(filter)}
                    className={`relative flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                      statusFilter === filter
                        ? 'bg-brand-burnt-orange text-white'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-700'
                    }`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                    {count > 0 && (
                      <span
                        className={`text-xs ${
                          statusFilter === filter ? 'text-white/80' : 'text-zinc-400'
                        }`}
                      >
                        {count}
                      </span>
                    )}
                  </button>
                )
              }
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {isPolling && (
            <Text className="text-xs text-zinc-500 dark:text-zinc-400">
              Live updating
            </Text>
          )}
          <Button
            type="button"
            plain
            onClick={onRefresh}
            disabled={loading}
            className="text-sm"
          >
            <ReloadIcon className={loading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Delivery list */}
      {filteredDeliveries.length === 0 ? (
        <div className="rounded-lg border border-zinc-200 bg-white p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <Text className="text-zinc-600 dark:text-zinc-400">
            No {statusFilter === 'all' ? 'all' : statusFilter} deliveries found
          </Text>
        </div>
      ) : (
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Time</TableHeader>
              <TableHeader>Provider</TableHeader>
              <TableHeader>Event Type</TableHeader>
              <TableHeader>Status</TableHeader>
              <TableHeader>Error</TableHeader>
              <TableHeader className="text-right">Actions</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredDeliveries.map((delivery) => (
              <TableRow key={delivery.id}>
                <TableCell>
                  <Text className="text-sm">{formatRelativeTime(new Date(delivery.createdAt))}</Text>
                </TableCell>
                <TableCell>
                  <Badge color={PROVIDER_COLORS[delivery.provider] || 'zinc'}>
                    {delivery.provider === 'github' ? 'GitHub' : 'Jira'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Text className="text-sm">{formatEventName(delivery.eventType)}</Text>
                </TableCell>
                <TableCell>
                  <Badge color={STATUS_COLORS[delivery.status]}>
                    {delivery.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {delivery.errorMessage ? (
                    <Text className="max-w-xs truncate text-sm text-red-600 dark:text-red-400" title={delivery.errorMessage}>
                      {delivery.errorMessage}
                    </Text>
                  ) : (
                    <Text className="text-sm text-zinc-400 dark:text-zinc-600">&mdash;</Text>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {delivery.status === 'failed' && (
                    <Button
                      type="button"
                      plain
                      onClick={() => handleRetry(delivery.id)}
                      disabled={retryingDelivery === delivery.id}
                      className="text-sm"
                    >
                      <ReloadIcon
                        className={retryingDelivery === delivery.id ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                      />
                      Retry
                    </Button>
                  )}
                  {delivery.status === 'succeeded' && delivery.ticketId && (
                    <Text className="text-xs text-zinc-500 dark:text-zinc-400">
                      Ticket: {delivery.ticketId.slice(0, 8)}...
                    </Text>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  )
}

// Summary component for dashboard view
interface DeliverySummaryProps {
  failedCount: number
  onRetryAll?: () => Promise<void>
}

export function DeliverySummary({ failedCount, onRetryAll }: DeliverySummaryProps) {
  const [isRetrying, setIsRetrying] = useState(false)

  async function handleRetryAll() {
    if (!onRetryAll) return
    setIsRetrying(true)
    try {
      await onRetryAll()
      toast.success('Retry all queued', {
        description: 'All failed webhooks will be reprocessed.',
      })
    } catch (error) {
      toast.error('Retry failed', {
        description: error instanceof Error ? error.message : 'Unknown error',
      })
    } finally {
      setIsRetrying(false)
    }
  }

  if (failedCount === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
      <div className="flex items-center justify-between">
        <div>
          <Text className="text-sm font-semibold text-amber-900 dark:text-amber-200">
            {failedCount} Failed Webhook{failedCount !== 1 ? 's' : ''}
          </Text>
          <Text className="text-xs text-amber-700 dark:text-amber-300">
            Some webhook deliveries failed to process
          </Text>
        </div>
        {onRetryAll && (
          <Button color="amber" onClick={handleRetryAll} disabled={isRetrying} className="text-sm">
            {isRetrying ? 'Retrying...' : 'Retry All'}
          </Button>
        )}
      </div>
    </div>
  )
}
