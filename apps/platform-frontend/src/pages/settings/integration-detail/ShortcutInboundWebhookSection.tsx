import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type { IntegrationInboundWebhookConfig, IntegrationWebhookDelivery } from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'

interface ShortcutInboundWebhookSectionProps {
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
  shortcutProjectId: string | null
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

const SHORTCUT_INBOUND_EVENT_OPTIONS: Array<{
  value: string
  label: string
  description: string
}> = [
  {
    value: 'story_created',
    label: 'Story created',
    description: 'Create a Viberator ticket when a new Shortcut story is created.',
  },
  {
    value: 'comment_created',
    label: 'Comment created',
    description: 'Process Shortcut comments for bot-triggered follow-up fixes.',
  },
]

export function ShortcutInboundWebhookSection({
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
  shortcutProjectId,
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
}: ShortcutInboundWebhookSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Shortcut Inbound Webhook</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Configure Shortcut story and comment webhooks to ingest targeted events into Viberator.
      </Text>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Shortcut setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>
            In Shortcut, open Settings {'>'} Integrations {'>'} Webhooks and create a webhook.
          </li>
          <li>Use the webhook URL below and enable the same story/comment events selected in this section.</li>
          <li>Set the signing secret below and send it as `X-Shortcut-Signature: sha256=&lt;hmac&gt;`.</li>
          <li>Use a Project ID filter in Shortcut when available to keep inbound routing targeted.</li>
        </ol>
      </div>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Inbound project scope</p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Shortcut Project ID currently used for targeted config mapping:
        </p>
        <code className="mt-2 inline-block rounded bg-zinc-200 px-2 py-1 text-xs dark:bg-zinc-700">
          {shortcutProjectId || 'No project filter configured'}
        </code>
        {!shortcutProjectId && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Save a Shortcut Project ID in integration configuration if you want project-scoped inbound targeting.
          </p>
        )}
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-zinc-500">Loading Shortcut webhook configuration...</div>
      ) : (
        <div className="mt-4 space-y-4">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create Shortcut inbound webhook'}
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
                    <label className="block text-sm font-medium text-zinc-900 dark:text-white">Webhook secret</label>
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
                      Configure Shortcut to generate `X-Shortcut-Signature` using this secret.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Allowed inbound events</p>
                    <div className="mt-2 space-y-2">
                      {SHORTCUT_INBOUND_EVENT_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={inboundEvents.includes(option.value)}
                            onChange={(event) => onToggleInboundEvent(option.value, event.target.checked)}
                            className="text-brand-600 focus:ring-brand-600 mt-0.5 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                          />
                          <span>
                            <span className="text-sm text-zinc-900 dark:text-white">{option.label}</span>
                            <span className="block text-xs text-zinc-500 dark:text-zinc-400">{option.description}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="checkbox"
                      id="shortcutAutoExecute"
                      checked={autoExecute}
                      onChange={(event) => onAutoExecuteChange(event.target.checked)}
                      className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                    />
                    <label htmlFor="shortcutAutoExecute" className="text-sm text-zinc-900 dark:text-white">
                      Auto-execute fixes after matching Shortcut inbound events
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
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Shortcut delivery history</h4>
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
                              delivery.status === 'succeeded' ? 'green' : delivery.status === 'failed' ? 'red' : 'amber'
                            }
                          >
                            {delivery.status}
                          </Badge>
                          {delivery.errorMessage && (
                            <span className="ml-2 text-xs text-red-600 dark:text-red-400">{delivery.errorMessage}</span>
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
