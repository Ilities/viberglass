import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { DeliveryHistoryTable } from './DeliveryHistoryTable'
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
    <section className="app-frame rounded-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
        <Subheading>Inbound Webhooks</Subheading>
      </div>
      <Text className="text-sm text-[var(--gray-9)]">
        Inbound webhooks create tickets from external payloads.
      </Text>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-[var(--gray-9)]">Loading inbound webhook configuration...</div>
      ) : (
        <div className="mt-6 space-y-6">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Setup Inbound Webhook'}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-3 pb-4 border-b border-[var(--gray-6)]">
                <label className="text-sm font-medium text-[var(--gray-12)]">Webhook</label>
                <select
                  value={selectedInboundConfigId || ''}
                  onChange={(e) => onSelectInboundWebhook(e.target.value)}
                  className="rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
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
                  <div className="pt-2">
                    <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Webhook URL</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={selectedInboundConfig.webhookUrl}
                        className="flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm font-mono text-[var(--gray-12)]"
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

                  <div className="pt-2">
                    <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Webhook Secret</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        readOnly
                        value={
                          selectedInboundConfig.webhookSecret ||
                          (selectedInboundConfig.hasSecret ? '(stored, hidden)' : '(none)')
                        }
                        className="flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm font-mono text-[var(--gray-12)]"
                      />
                      <Button color="zinc" onClick={onToggleSecretVisibility}>
                        {showSecret ? 'Hide' : 'Show'}
                      </Button>
                      <Button color="zinc" onClick={onGenerateSecret} disabled={isSavingWebhook}>
                        Regenerate
                      </Button>
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--gray-9)]">
                      Use this secret to verify webhook signatures. Keep it secure.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 pt-2">
                    <input
                      type="checkbox"
                      id="autoExecute"
                      checked={autoExecute}
                      onChange={(e) => onAutoExecuteChange(e.target.checked)}
                      className="h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)] text-[var(--accent-9)] focus:ring-[var(--accent-9)]"
                    />
                    <label htmlFor="autoExecute" className="text-sm text-[var(--gray-12)]">
                      Auto-execute fixes on inbound events
                    </label>
                    {hasInboundChanges && (
                      <Button color="brand" size="small" onClick={onSaveWebhook} disabled={isSavingWebhook}>
                        {isSavingWebhook ? 'Saving...' : 'Save'}
                      </Button>
                    )}
                  </div>

                  <div className="border-t border-[var(--gray-6)] pt-4">
                    <Button color="red" onClick={onDeleteInboundWebhook} disabled={isSavingWebhook}>
                      Remove Selected Inbound Webhook
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          {showCustomPayloadHelp && selectedInboundConfig && (
            <div className="rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
              <p className="mb-2 text-sm font-medium text-[var(--gray-12)]">Expected Payload Format</p>
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

          <DeliveryHistoryTable
            title="Inbound deliveries"
            emptyMessage="No inbound webhook deliveries yet."
            deliveries={deliveries}
            isLoadingDeliveries={isLoadingDeliveries}
            onRefreshDeliveries={onRefreshDeliveries}
            onRetryDelivery={onRetryDelivery}
          />
        </div>
      )}
    </section>
  )
}
