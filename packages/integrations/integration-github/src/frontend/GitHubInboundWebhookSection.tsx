import { useTicketUrlBuilder } from '@viberglass/integration-core/frontend'
import { Button } from '@viberglass/platform-ui'
import { Subheading } from '@viberglass/platform-ui'
import { Text } from '@viberglass/platform-ui'
import { DeliveryHistoryTable } from '@viberglass/integration-core/frontend'
import type {
  IntegrationInboundWebhookConfig,
  IntegrationWebhookDelivery,
} from '@viberglass/integration-core/frontend'
import { CopyIcon } from '@radix-ui/react-icons'

interface GitHubInboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  githubAutoExecuteMode: 'matching_events' | 'label_gated'
  githubRequiredLabels: string[]
  hasInboundChanges: boolean
  inboundEvents: string[]
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  projects: Array<{ id: string; name: string; slug?: string }> | null
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  selectedInboundProjectId: string | null
  selectedInboundProviderProjectId: string | null
  showSecret: boolean
  onAutoExecuteChange: (value: boolean) => void
  onGitHubAutoExecuteModeChange: (mode: 'matching_events' | 'label_gated') => void
  onGitHubRequiredLabelsChange: (labels: string[]) => void
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

function parseGitHubRequiredLabelsInput(value: string): string[] {
  const labels: string[] = []
  for (const rawLabel of value.split(',')) {
    const normalized = rawLabel.trim().toLowerCase()
    if (!normalized || labels.includes(normalized)) {
      continue
    }
    labels.push(normalized)
  }
  return labels
}

export function GitHubInboundWebhookSection({
  autoExecute,
  deliveries,
  githubAutoExecuteMode,
  githubRequiredLabels,
  hasInboundChanges,
  inboundEvents,
  inboundWebhooks,
  isLoadingDeliveries,
  isLoadingWebhook,
  isSavingWebhook,
  projects,
  selectedInboundConfig,
  selectedInboundConfigId,
  selectedInboundProjectId,
  selectedInboundProviderProjectId,
  showSecret,
  onAutoExecuteChange,
  onGitHubAutoExecuteModeChange,
  onGitHubRequiredLabelsChange,
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
}: GitHubInboundWebhookSectionProps) {
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
      <Subheading>GitHub Inbound Webhook</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        Configure GitHub repository webhooks to ingest issues and comments into Viberator.
      </Text>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">GitHub setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-[var(--gray-9)]">
          <li>Open your repository in GitHub and navigate to Settings {'>'} Webhooks.</li>
          <li>Use the webhook URL below as the Payload URL and set content type to `application/json`.</li>
          <li>Set the webhook secret below and enable only the inbound events selected in this section.</li>
        </ol>
      </div>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">Inbound routing scope</p>
        <p className="mt-1 text-xs text-[var(--gray-9)]">
          Map each inbound config to a Viberglass project and GitHub repository (`owner/repo`) to keep routing deterministic.
        </p>
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-[var(--gray-9)]">Loading GitHub webhook configuration...</div>
      ) : (
        <div className="mt-6 space-y-6">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={onCreateInboundWebhook} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create GitHub Inbound Webhook'}
            </Button>
          ) : (
            <>
              <div className="flex items-center gap-3 pt-2">
                <label className="text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Inbound configuration</label>
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
                      <label htmlFor="githubInboundProjectId" className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                        Viberglass project
                      </label>
                      <select
                        id="githubInboundProjectId"
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
                    <label htmlFor="githubInboundProviderProjectId" className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                      GitHub repository (`owner/repo`)
                    </label>
                    <input
                      id="githubInboundProviderProjectId"
                      type="text"
                      value={selectedInboundProviderProjectId ?? ''}
                      onChange={(event) => {
                        const value = event.target.value.trim()
                        onProviderProjectIdChange(value.length > 0 ? value : null)
                      }}
                      placeholder="e.g. acme/platform-api"
                      className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
                    />
                    <p className="mt-1.5 text-xs text-[var(--gray-9)]">
                      Required for deterministic routing when multiple repositories are configured.
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
                    <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Webhook Secret</label>
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
                      Configure GitHub to send the `X-Hub-Signature-256` header using this secret.
                    </p>
                  </div>

                  <div className="pt-2">
                    <p className="text-sm font-medium text-[var(--gray-12)]">Allowed inbound events</p>
                    <div className="mt-2 space-y-2">
                      {GITHUB_INBOUND_EVENT_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            checked={inboundEvents.includes(option.value)}
                            onChange={(event) => onToggleInboundEvent(option.value, event.target.checked)}
                            className="text-[var(--accent-9)] focus:ring-[var(--accent-9)] mt-0.5 h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)]"
                          />
                          <span>
                            <span className="text-sm text-[var(--gray-12)]">{option.label}</span>
                            <span className="block text-xs text-[var(--gray-9)]">
                              {option.description}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="githubAutoExecute"
                        checked={autoExecute}
                        onChange={(event) => onAutoExecuteChange(event.target.checked)}
                        className="text-[var(--accent-9)] focus:ring-[var(--accent-9)] h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)]"
                      />
                      <label htmlFor="githubAutoExecute" className="text-sm text-[var(--gray-12)]">
                        Auto-execute fixes after matching GitHub inbound events
                      </label>
                    </div>

                    <div>
                      <label htmlFor="githubAutoExecuteMode" className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                        Auto-execute policy
                      </label>
                      <select
                        id="githubAutoExecuteMode"
                        value={githubAutoExecuteMode}
                        onChange={(event) =>
                          onGitHubAutoExecuteModeChange(
                            event.target.value === 'label_gated' ? 'label_gated' : 'matching_events'
                          )
                        }
                        disabled={!autoExecute}
                        className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <option value="matching_events">Run on matching inbound events</option>
                        <option value="label_gated">Only run when issue has configured labels</option>
                      </select>
                    </div>

                    {autoExecute && githubAutoExecuteMode === 'label_gated' && (
                      <div>
                        <label htmlFor="githubRequiredLabels" className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">
                          Required issue labels
                        </label>
                        <input
                          id="githubRequiredLabels"
                          type="text"
                          value={githubRequiredLabels.join(', ')}
                          onChange={(event) => onGitHubRequiredLabelsChange(parseGitHubRequiredLabelsInput(event.target.value))}
                          placeholder="e.g. autofix, ai-fix"
                          className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
                        />
                        <p className="mt-1.5 text-xs text-[var(--gray-9)]">
                          A job runs only if at least one configured label is present on the GitHub issue.
                        </p>
                      </div>
                    )}

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
            title="GitHub delivery history"
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
