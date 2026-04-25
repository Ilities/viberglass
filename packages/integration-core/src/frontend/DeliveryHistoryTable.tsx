import { Badge } from '@viberglass/platform-ui'
import { Button } from '@viberglass/platform-ui'
import { Link } from '@viberglass/platform-ui'
import type { IntegrationWebhookDelivery } from './types'

interface DeliveryHistoryTableProps {
  title: string
  emptyMessage: string
  deliveries: IntegrationWebhookDelivery[]
  isLoadingDeliveries: boolean
  onRefreshDeliveries: () => void
  onRetryDelivery: (deliveryId: string) => void
  getTicketUrl?: (delivery: IntegrationWebhookDelivery) => string | null
}

export function DeliveryHistoryTable({
  title,
  emptyMessage,
  deliveries,
  isLoadingDeliveries,
  onRefreshDeliveries,
  onRetryDelivery,
  getTicketUrl,
}: DeliveryHistoryTableProps) {
  return (
    <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-900 dark:text-white">{title}</h4>
        <Button color="zinc" size="small" onClick={onRefreshDeliveries} disabled={isLoadingDeliveries}>
          {isLoadingDeliveries ? 'Refreshing...' : 'Refresh'}
        </Button>
      </div>

      {deliveries.length === 0 ? (
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
              <tr>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Ticket</th>
                <th className="px-3 py-2">Time</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {deliveries.map((delivery) => {
                const ticketUrl = getTicketUrl?.(delivery) ?? null
                return (
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
                    <td className="px-3 py-2">
                      {delivery.ticketId ? (
                        ticketUrl ? (
                          <Link href={ticketUrl} className="text-sm">
                            {delivery.ticketId}
                          </Link>
                        ) : (
                          delivery.ticketId
                        )
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-3 py-2 text-zinc-500">{new Date(delivery.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">
                      {(delivery.retryable ?? delivery.status === 'failed') && (
                        <Button color="zinc" size="small" onClick={() => onRetryDelivery(delivery.id)}>
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
