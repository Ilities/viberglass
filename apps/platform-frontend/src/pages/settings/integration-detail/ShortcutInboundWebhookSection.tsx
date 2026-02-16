import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { DeliveryHistoryTable } from './DeliveryHistoryTable'
import type { IntegrationInboundWebhookConfig, IntegrationWebhookDelivery } from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'
import { useTicketUrlBuilder } from './deliveryUtils'

interface ShortcutInboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundEvents: string[]
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  projects: Array<{ id: string; name: string; slug?: string }> | null
  selectedInboundProjectId: string | null
  selectedInboundProviderProjectId: string | null
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  showSecret: boolean
  onAutoExecuteChange: (value: boolean) => void
  onCopyWebhookSecret: () => void
  onCopyWebhookUrl: (url: string) => void
  onCreateInboundWebhook: () => void
  onDeleteInboundWebhook: () => void
  onGenerateSecret: () => void
  onInboundProjectChange: (projectId: string | null) => void
  onProviderProjectIdChange: (projectId: string | null) => void
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
  projects,
  selectedInboundProjectId,
  selectedInboundProviderProjectId,
  selectedInboundConfig,
  selectedInboundConfigId,
  showSecret,
  onAutoExecuteChange,
  onCopyWebhookSecret,
  onCopyWebhookUrl,
  onCreateInboundWebhook,
  onDeleteInboundWebhook,
  onGenerateSecret,
  onInboundProjectChange,
  onProviderProjectIdChange,
  onRefreshDeliveries,
  onRetryDelivery,
  onSaveWebhook,
  onSelectInboundWebhook,
  onToggleInboundEvent,
  onToggleSecretVisibility,
}: ShortcutInboundWebhookSectionProps) {
  const getTicketUrl = useTicketUrlBuilder(projects)
  return (
    <section className="app-frame rounded-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>
      <Subheading>Shortcut Inbound Webhook</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        Configure inbound Shortcut events that create Viberglass tickets and optionally auto-run jobs.
      </Text>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">Shortcut setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-[var(--gray-9)]">
          <li>
            In Shortcut, open Settings {'>'} Integrations {'>'} Webhooks and create a webhook.
          </li>
          <li>Use the webhook URL below and enable the same story/comment events selected in this section.</li>
          <li>Set the signing secret below and send it as `X-Shortcut-Signature: sha256=&lt;hmac&gt;`.</li>
          <li>Use a Shortcut Project ID filter when possible to keep inbound routing deterministic.</li>
        </ol>
      </div>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">Project scope</p>
        <p className="mt-1 text-xs text-[var(--gray-9)]">
          Each inbound config can map events to a Viberglass project and optionally pin routing to a Shortcut project ID.
        </p>
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-[var(--gray-9)]">Loading Shortcut webhook configuration...</div>
      ) : (
        <div className="mt-6 space-y-6">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create Shortcut inbound webhook'}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Inbound configuration</label>
                <select
                  value={selectedInboundConfigId || ''}
                  onChange={(event) => onSelectInboundWebhook(event.target.value)}
                  className="rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
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
                  {projects && projects.length > 0 && (
                    <div className="pt-2">
                      <label htmlFor="shortcutInboundProjectId" className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                        Viberglass project
                      </label>
                      <select
                        id="shortcutInboundProjectId"
                        value={selectedInboundProjectId ?? ''}
                        onChange={(event) => onInboundProjectChange(event.target.value || null)}
                        className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
                      >
                        <option value="">Use integration-linked default project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="pt-2">
                    <label htmlFor="shortcutInboundProviderProjectId" className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                      Shortcut project ID (optional)
                    </label>
                    <input
                      id="shortcutInboundProviderProjectId"
                      type="text"
                      value={selectedInboundProviderProjectId ?? ''}
                      onChange={(event) => {
                        const value = event.target.value.trim()
                        onProviderProjectIdChange(value.length > 0 ? value : null)
                      }}
                      placeholder="e.g. 12345"
                      className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
                    />
                    <p className="mt-1.5 text-xs text-[var(--gray-9)]">
                      Used to match inbound events to the correct integration config when multiple projects are linked.
                    </p>
                  </div>

                  <div className="pt-2">
                    <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Webhook URL</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={selectedInboundConfig.webhookUrl}
                        className="flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm font-mono text-[var(--gray-12)]"
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

                  <div className="pt-2">
                    <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Webhook secret</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        readOnly
                        value={
                          selectedInboundConfig.webhookSecret ||
                          (selectedInboundConfig.hasSecret ? '(stored, hidden)' : '(none)')
                        }
                        className="min-w-72 flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm font-mono text-[var(--gray-12)]"
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
                    <p className="mt-1.5 text-xs text-[var(--gray-9)]">
                      Configure Shortcut to generate `X-Shortcut-Signature` using this secret.
                    </p>
                  </div>

                  <div className="pt-2">
                    <p className="text-sm font-medium text-[var(--gray-12)]">Allowed inbound events</p>
                    <div className="mt-2 space-y-2">
                      {SHORTCUT_INBOUND_EVENT_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={inboundEvents.includes(option.value)}
                            onChange={(event) => onToggleInboundEvent(option.value, event.target.checked)}
                            className="text-[var(--accent-9)] focus:ring-[var(--accent-9)] mt-0.5 h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)]"
                          />
                          <span>
                            <span className="text-sm text-[var(--gray-12)]">{option.label}</span>
                            <span className="block text-xs text-[var(--gray-9)]">{option.description}</span>
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
                      className="text-[var(--accent-9)] focus:ring-[var(--accent-9)] h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)]"
                    />
                    <label htmlFor="shortcutAutoExecute" className="text-sm text-[var(--gray-12)]">
                      Auto-execute jobs after matching Shortcut inbound events
                    </label>
                    {hasInboundChanges && (
                      <Button color="brand" size="small" onClick={onSaveWebhook} disabled={isSavingWebhook}>
                        {isSavingWebhook ? 'Saving...' : 'Save inbound settings'}
                      </Button>
                    )}
                  </div>

                  <div className="border-t border-[var(--gray-6)] pt-4">
                    <Button color="red" onClick={onDeleteInboundWebhook} disabled={isSavingWebhook}>
                      Remove selected inbound configuration
                    </Button>
                  </div>
                </>
              )}
            </>
          )}

          <DeliveryHistoryTable
            title="Shortcut delivery history"
            emptyMessage="No deliveries yet for the selected inbound configuration."
            deliveries={deliveries}
            isLoadingDeliveries={isLoadingDeliveries}
            onRefreshDeliveries={onRefreshDeliveries}
            onRetryDelivery={onRetryDelivery}
            getTicketUrl={getTicketUrl}
          />
        </div>
      )}
    </section>
  )
}
