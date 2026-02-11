import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { DeliveryHistoryTable } from './DeliveryHistoryTable'
import type {
  IntegrationInboundWebhookConfig,
  IntegrationWebhookDelivery,
} from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'

interface JiraInboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundEvents: string[]
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  jiraProjectKey: string | null
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

const JIRA_INBOUND_EVENT_OPTIONS: Array<{
  value: string
  label: string
  description: string
}> = [
  {
    value: 'issue_created',
    label: 'Issue created',
    description: 'Create new Viberator tickets when new Jira issues are created.',
  },
  {
    value: 'issue_updated',
    label: 'Issue updated',
    description: 'Process Jira issue updates, including issue comment actions.',
  },
  {
    value: 'comment_created',
    label: 'Comment created',
    description: 'Process new Jira issue comments as inbound updates.',
  },
]

export function JiraInboundWebhookSection({
  autoExecute,
  deliveries,
  hasInboundChanges,
  inboundEvents,
  inboundWebhooks,
  isLoadingDeliveries,
  isLoadingWebhook,
  isSavingWebhook,
  jiraProjectKey,
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
}: JiraInboundWebhookSectionProps) {
  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Jira Inbound Webhook</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Configure Jira webhooks to ingest issue and comment activity into Viberator.
      </Text>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Jira setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-zinc-600 dark:text-zinc-400">
          <li>In Jira, open Settings {'>'} System {'>'} Webhooks and add a new webhook.</li>
          <li>Use the webhook URL below and select the same inbound events enabled in this section.</li>
          <li>Set project filtering with your Jira project key to keep payload routing targeted.</li>
          <li>Set and rotate the webhook secret below for request signature verification.</li>
        </ol>
      </div>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Inbound project scope</p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Active project key used for config targeting:
        </p>
        <code className="mt-2 inline-block rounded bg-zinc-200 px-2 py-1 text-xs dark:bg-zinc-700">
          {jiraProjectKey || 'Missing project key in integration configuration'}
        </code>
        {!jiraProjectKey && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Save a Jira Project Key in the integration configuration before creating or saving inbound webhooks.
          </p>
        )}
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-zinc-500">Loading Jira webhook configuration...</div>
      ) : (
        <div className="mt-4 space-y-4">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create Jira inbound webhook'}
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
                      Configure Jira to include the `X-Atlassian-Webhook-Signature` header derived from this secret.
                    </p>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-white">Allowed inbound events</p>
                    <div className="mt-2 space-y-2">
                      {JIRA_INBOUND_EVENT_OPTIONS.map((option) => (
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
                      id="jiraAutoExecute"
                      checked={autoExecute}
                      onChange={(event) => onAutoExecuteChange(event.target.checked)}
                      className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
                    />
                    <label htmlFor="jiraAutoExecute" className="text-sm text-zinc-900 dark:text-white">
                      Auto-execute fixes after matching Jira inbound events
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

          <DeliveryHistoryTable
            title="Jira delivery history"
            emptyMessage="No deliveries yet for the selected inbound configuration."
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
