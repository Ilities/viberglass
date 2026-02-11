import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { DeliveryHistoryTable } from './DeliveryHistoryTable'
import type {
  IntegrationInboundWebhookConfig,
  IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'

interface CustomInboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundActive: boolean
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  projects: Array<{ id: string; name: string }> | null
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  selectedProjectId: string | null
  showSecret: boolean
  onAutoExecuteChange: (value: boolean) => void
  onCopyWebhookSecret: () => void
  onCopyWebhookUrl: (url: string) => void
  onCreateInboundWebhook: (projectId: string | null) => void
  onDeleteInboundWebhook: () => void
  onGenerateSecret: () => void
  onInboundActiveChange: (value: boolean) => void
  onProjectChange: (projectId: string | null) => void
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
  "category": "string (optional, default: \\"bug\\")",
  "externalId": "string (optional)",
  "url": "string (optional)"
}`

export function CustomInboundWebhookSection({
  autoExecute,
  deliveries,
  hasInboundChanges,
  inboundActive,
  inboundWebhooks,
  isLoadingDeliveries,
  isLoadingWebhook,
  isSavingWebhook,
  projects,
  selectedInboundConfig,
  selectedInboundConfigId,
  selectedProjectId,
  showSecret,
  onAutoExecuteChange,
  onCopyWebhookSecret,
  onCopyWebhookUrl,
  onCreateInboundWebhook,
  onDeleteInboundWebhook,
  onGenerateSecret,
  onInboundActiveChange,
  onProjectChange,
  onRefreshDeliveries,
  onRetryDelivery,
  onSaveWebhook,
  onSelectInboundWebhook,
  onToggleSecretVisibility,
}: CustomInboundWebhookSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Custom Inbound Webhooks</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Manage multiple custom inbound endpoints with isolated URLs, secrets, and delivery history.
      </Text>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Custom setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>Create one endpoint per upstream source that should send tickets independently.</li>
          <li>
            Send <code>POST</code> requests using the selected endpoint URL and payload shape shown below.
          </li>
          <li>Sign the raw request body with the endpoint secret using HMAC-SHA256.</li>
        </ol>
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-zinc-500">Loading custom webhook configuration...</div>
      ) : (
        <div className="mt-4 space-y-4">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={() => onCreateInboundWebhook(selectedProjectId)} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create custom inbound endpoint'}
            </Button>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-zinc-900 dark:text-white">Inbound endpoints</p>
                  <Button color="zinc" size="small" onClick={() => onCreateInboundWebhook(selectedProjectId)} disabled={isSavingWebhook}>
                    Add
                  </Button>
                </div>

                {inboundWebhooks.map((config, index) => {
                  const isSelected = config.id === selectedInboundConfigId
                  return (
                    <button
                      key={config.id}
                      type="button"
                      onClick={() => onSelectInboundWebhook(config.id)}
                      className={[
                        'w-full rounded-md border px-3 py-2 text-left transition',
                        isSelected
                          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20'
                          : 'border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-zinc-900 dark:text-white">{`Endpoint ${index + 1}`}</span>
                        <Badge color={config.active ? 'green' : 'amber'}>
                          {config.active ? 'Active' : 'Disabled'}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{config.id.slice(0, 12)}</p>
                    </button>
                  )
                })}
              </div>

              {selectedInboundConfig ? (
                <div className="space-y-4">
                  {projects && projects.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-900 dark:text-white">
                        Link to Project
                      </label>
                      <select
                        value={selectedProjectId ?? ''}
                        onChange={(event) => onProjectChange(event.target.value || null)}
                        className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
                      >
                        <option value="">Global (all projects)</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        Tickets from this webhook will be assigned to the selected project.
                      </p>
                    </div>
                  )}

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
                      Use this secret to compute <code>X-Webhook-Signature-256</code> with HMAC-SHA256 over the raw
                      payload.
                    </p>
                  </div>

                  <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                    <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Inbound event type</p>
                    <p className="mt-1 text-sm text-zinc-900 dark:text-white">
                      <code>ticket_created</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="customInboundActive"
                        checked={inboundActive}
                        onChange={(event) => onInboundActiveChange(event.target.checked)}
                        className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                      />
                      <span className="text-sm text-zinc-900 dark:text-white">Enable this inbound endpoint</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="customInboundAutoExecute"
                        checked={autoExecute}
                        onChange={(event) => onAutoExecuteChange(event.target.checked)}
                        className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                      />
                      <span className="text-sm text-zinc-900 dark:text-white">
                        Auto-execute fixes for accepted inbound events
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {hasInboundChanges && (
                      <Button color="brand" onClick={onSaveWebhook} disabled={isSavingWebhook}>
                        {isSavingWebhook ? 'Saving...' : 'Save endpoint settings'}
                      </Button>
                    )}
                    <Button color="red" onClick={onDeleteInboundWebhook} disabled={isSavingWebhook}>
                      Remove selected endpoint
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-zinc-200 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
                  Select an endpoint to view its details.
                </div>
              )}
            </div>
          )}

          {selectedInboundConfig && (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
              <p className="mb-2 text-sm font-medium text-zinc-900 dark:text-white">Expected payload format</p>
              <pre className="overflow-x-auto text-xs text-zinc-700 dark:text-zinc-300">{CUSTOM_PAYLOAD_EXAMPLE}</pre>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                Required header:{' '}
                <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-700">
                  X-Webhook-Signature-256: sha256=&lt;hmac_hex&gt;
                </code>
              </p>
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                Optional idempotency header:{' '}
                <code className="rounded bg-zinc-200 px-1 py-0.5 dark:bg-zinc-700">
                  X-Webhook-Delivery-Id: &lt;unique-id&gt;
                </code>
              </p>
            </div>
          )}

          <DeliveryHistoryTable
            title="Delivery history"
            emptyMessage="No deliveries yet for the selected inbound endpoint."
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
