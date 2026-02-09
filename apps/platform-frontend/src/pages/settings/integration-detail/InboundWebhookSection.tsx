import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type {
  IntegrationInboundWebhookConfig,
  IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'

interface InboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  showCustomPayloadHelp: boolean
  showSecret: boolean
  onAutoExecuteChange: (value: boolean) => void
  onCopyWebhookUrl: (url: string) => void
  onCreateInboundWebhook: () => void
  onDeleteInboundWebhook: () => void
  onGenerateSecret: () => void
  onRefreshDeliveries: () => void
  onRetryDelivery: (deliveryId: string) => void
  onSaveWebhook: () => void
  onSelectInboundWebhook: (configId: string) => void
  onToggleSecretVisibility: () => void
}

const CUSTOM_PAYLOAD_EXAMPLE = `{
  "title": "string (required)",
  "description": "string (required)",
  "severity": "low | medium | high | critical (optional)",
  "category": "string (optional, default: 'bug')",
  "externalId": "string (optional, for deduplication)",
  "url": "string (optional, link back to source)"
}`

export function InboundWebhookSection({
  autoExecute,
  deliveries,
  hasInboundChanges,
  inboundWebhooks,
  isLoadingDeliveries,
  isLoadingWebhook,
  isSavingWebhook,
  selectedInboundConfig,
  selectedInboundConfigId,
  showCustomPayloadHelp,
  showSecret,
  onAutoExecuteChange,
  onCopyWebhookUrl,
  onCreateInboundWebhook,
  onDeleteInboundWebhook,
  onGenerateSecret,
  onRefreshDeliveries,
  onRetryDelivery,
  onSaveWebhook,
  onSelectInboundWebhook,
  onToggleSecretVisibility,
}: InboundWebhookSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Inbound Webhooks</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Inbound webhooks create tickets from external payloads.
      </Text>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-zinc-500">Loading inbound webhook configuration...</div>
      ) : (
        <div className="mt-4 space-y-4">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Setup Inbound Webhook'}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-zinc-900 dark:text-white">Webhook</label>
                <select
                  value={selectedInboundConfigId || ''}
                  onChange={(e) => onSelectInboundWebhook(e.target.value)}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                >
                  {inboundWebhooks.map((config, index) => (
                    <option key={config.id} value={config.id}>
                      {`Webhook ${index + 1} (${config.id.slice(0, 8)})`}
                    </option>
                  ))}
                </select>
                <Button color="zinc" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
                  Add
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
                        title="Copy to clipboard"
                      >
                        <CopyIcon className="size-4" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-900 dark:text-white">Webhook Secret</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        readOnly
                        value={
                          selectedInboundConfig.webhookSecret ||
                          (selectedInboundConfig.hasSecret ? '(stored, hidden)' : '(none)')
                        }
                        className="flex-1 rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      />
                      <Button color="zinc" onClick={onToggleSecretVisibility}>
                        {showSecret ? 'Hide' : 'Show'}
                      </Button>
                      <Button color="zinc" onClick={onGenerateSecret} disabled={isSavingWebhook}>
                        Regenerate
                      </Button>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      Use this secret to verify webhook signatures. Keep it secure.
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="autoExecute"
                      checked={autoExecute}
                      onChange={(e) => onAutoExecuteChange(e.target.checked)}
                      className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                    />
                    <label htmlFor="autoExecute" className="text-sm text-zinc-900 dark:text-white">
                      Auto-execute fixes on inbound events
                    </label>
                    {hasInboundChanges && (
                      <Button color="brand" size="small" onClick={onSaveWebhook} disabled={isSavingWebhook}>
                        {isSavingWebhook ? 'Saving...' : 'Save'}
                      </Button>
                    )}
                  </div>

                  <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
                    <Button color="red" onClick={onDeleteInboundWebhook} disabled={isSavingWebhook}>
                      Remove Selected Inbound Webhook
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {showCustomPayloadHelp && selectedInboundConfig && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Expected Payload Format</p>
              <pre className="overflow-x-auto text-xs text-zinc-700 dark:text-zinc-300">{CUSTOM_PAYLOAD_EXAMPLE}</pre>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Send POST requests to the webhook URL with the payload above. Include{' '}
                <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-700">
                  X-Webhook-Signature-256: sha256=&lt;hmac&gt;
                </code>{' '}
                header for signature verification.
              </p>
            </div>
          )}

          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
            <div className="mb-3 flex items-center justify-between">
              <h4 className="text-sm font-medium text-zinc-900 dark:text-white">Inbound Deliveries</h4>
              <Button color="zinc" size="small" onClick={onRefreshDeliveries} disabled={isLoadingDeliveries}>
                {isLoadingDeliveries ? 'Refreshing...' : 'Refresh'}
              </Button>
            </div>

            {deliveries.length === 0 ? (
              <p className="text-sm text-zinc-500 dark:text-zinc-400">No inbound webhook deliveries yet.</p>
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
