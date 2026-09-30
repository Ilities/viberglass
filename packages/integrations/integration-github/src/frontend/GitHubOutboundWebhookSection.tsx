import { Button } from '@viberglass/platform-ui'
import { Subheading } from '@viberglass/platform-ui'
import { Text } from '@viberglass/platform-ui'
import type { OutboundWebhookSectionProps } from '@viberglass/integration-core/frontend'

export function GitHubOutboundWebhookSection({
  isSavingWebhook,
  outboundWebhook,
  providerProjectMapping,
  onSaveOutboundWebhook,
}: OutboundWebhookSectionProps) {
  const repositoryMapping = providerProjectMapping ?? null
  const issuePreview = repositoryMapping ? `${repositoryMapping}#123` : 'Resolved from inbound ticket metadata'

  return (
    <section className="app-frame rounded-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-20M22 12l-8-8M22 12l-8 8" />
          </svg>
        </div>
      </div>
      <Subheading>GitHub Feedback</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        Publish job lifecycle feedback back to the originating GitHub issue or comment context.
      </Text>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">Always-on feedback events</p>
        <p className="mt-1 text-xs text-[var(--gray-9)]">
          Viberglass always sends `job_started` and `job_ended` updates for tickets created from GitHub inbound events.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">
            Repository mapping: {repositoryMapping || 'Not configured'}
          </code>
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">Issue target: {issuePreview}</code>
        </div>
        {!repositoryMapping && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Save an inbound GitHub repository mapping to strengthen project-scoped outbound config matching.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <p className="text-sm text-[var(--gray-11)]">
          Comments are posted with this connection's default GitHub token, the one under Credentials. It needs
          permission to comment on issues.
        </p>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button color="brand" onClick={onSaveOutboundWebhook} disabled={isSavingWebhook}>
            {isSavingWebhook ? 'Saving...' : outboundWebhook ? 'Save feedback settings' : 'Enable feedback'}
          </Button>
        </div>
      </div>
    </section>
  )
}
