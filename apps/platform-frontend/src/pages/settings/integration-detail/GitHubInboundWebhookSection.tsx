import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type {
  IntegrationInboundWebhookConfig,
  IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'

interface GitHubInboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundEvents: string[]
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  showSecret: boolean
  onAutoExecuteChange: (value: boolean) => void
  onCopyWebhookSecret: () => void
  onCopyWebhookUrl: (url: string) => void
  onCreateInboundWebhook: () => void
  onDeleteInboundWebhook: () => void
  onGenerateSecret: () => void
  onRefreshDeliveries: () => void
  onRetryDelivery: (deliveryId: string) => void
  onSaveWebhook: () => void
  onSelectInboundWebhook: (configId: string) => void
  onToggleInboundEvent: (eventType: string, enabled: boolean) => void
  onToggleSecretVisibility: () => void
}

const GITHUB_INBOUND_EVENT_OPTIONS: Array<{
  value: string
  label: string
  description: string
}> = [
  {
    value: 'issues.opened',
    label: 'Issue opened',
    description: 'Create tickets when a new issue is opened.',
  },
  {
    value: 'issue_comment.created',
    label: 'Issue comment created',
    description: 'Process follow-up comments on existing issues.',
  },
]

export function GitHubInboundWebhookSection({
  autoExecute,
  deliveries,
  hasInboundChanges,
  inboundEvents,
  inboundWebhooks,
  isLoadingDeliveries,
  isLoadingWebhook,
  isSavingWebhook,
  selectedInboundConfig,
  selectedInboundConfigId,
  showSecret,
  onAutoExecuteChange,
  onCopyWebhookSecret,
  onCopyWebhookUrl,
  onCreateInboundWebhook,
  onDeleteInboundWebhook,
  onGenerateSecret,
  onRefreshDeliveries,
  onRetryDelivery,
  onSaveWebhook,
  onSelectInboundWebhook,
  onToggleInboundEvent,
  onToggleSecretVisibility,
}: GitHubInboundWebhookSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>GitHub Inbound Webhook</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Configure GitHub repository webhooks to ingest issues and comments into Viberator.
      </Text>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">GitHub setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>Open your repository in GitHub and navigate to Settings {'>'} Webhooks.</li>
          <li>Use the webhook URL below as the Payload URL and set content type to `application/json`.</li>
          <li>Set the webhook secret below and enable only the inbound events selected in this section.</li>
        </ol>
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-zinc-500">Loading GitHub webhook configuration...</div>
      ) : (
        <div className="mt-4 space-y-4">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create GitHub Inbound Webhook'}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-zinc-900 dark:text-white">Inbound configuration</label>
                <select
                  value={selectedInboundConfigId || ''}
                  onChange={(event) => onSelectInboundWebhook(event.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  {inboundWebhooks.map((config, index) => (
                    <option key={config.id} value={config.id}>
                      {`Config ${index + 1} (${config.id.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
                <Button color="zinc" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
                  Add configuration
                </Button>
              </div>

              {selectedInboundConfig && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-zinc-900 dark:text-white">Webhook URL</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={selectedInboundConfig.webhookUrl}
                        className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <Button
                        color="zinc"
                        onClick={() => onCopyWebhookUrl(selectedInboundConfig.webhookUrl)}
                        title="Copy URL"
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-900 dark:text-white">Webhook Secret</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        readOnly
                        value={
                          selectedInboundConfig.webhookSecret ||
                          (selectedInboundConfig.hasSecret ? '(stored, hidden)' : '(none)')
                        }
                        className="min-w-72 flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <Button color="zinc" onClick={onToggleSecretVisibility}>
                        {showSecret ? 'Hide' : 'Show'}
                      </Button>
                      <Button color="zinc" onClick={onCopyWebhookSecret}>
                        Copy
                      </Button>
                      <Button color="zinc" onClick={onGenerateSecret} disabled={isSavingWebhook}>
                        Regenerate
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Configure GitHub to send the `X-Hub-Signature-256` header using this secret.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Allowed inbound events</p>
                    <div className="mt-2 space-y-2">
                      {GITHUB_INBOUND_EVENT_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={inboundEvents.includes(option.value)}
                            onChange={(event) => onToggleInboundEvent(option.value, event.target.checked)}
                            className="text-brand-600 focus:ring-brand-600 mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                          />
                          <span>
                            <span className="text-sm text-zinc-900 dark:text-white">{option.label}</span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
                              {option.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      id="githubAutoExecute"
                      checked={autoExecute}
                      onChange={(event) => onAutoExecuteChange(event.target.checked)}
                      className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                    />
                    <label htmlFor="githubAutoExecute" className="text-sm text-zinc-900 dark:text-white">
                      Auto-execute fixes after a matching inbound GitHub event
                    </label>
                    {hasInboundChanges && (
                      <Button color="brand" size="small" onClick={onSaveWebhook} disabled={isSavingWebhook}>
                        {isSavingWebhook ? 'Saving...' : 'Save inbound settings'}
                      </Button>
                    )}
                  </div>

                  <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <Button color="red" onClick={onDeleteInboundWebhook} disabled={isSavingWebhook}>
                      Remove selected inbound configuration
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white">GitHub delivery history</h4>
              <Button color="zinc" size="small" onClick={onRefreshDeliveries} disabled={isLoadingDeliveries}>
                {isLoadingDeliveries ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {deliveries.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                No deliveries yet for the selected inbound configuration.
              </p>
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
                            <Button color="zinc" size="small" onClick={() => onRetryDelivery(delivery.id)}>
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
  )
}
