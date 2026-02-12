import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type { IntegrationOutboundWebhookConfig } from '@/service/api/integration-api'

interface JiraOutboundWebhookSectionProps {
  isSavingWebhook: boolean
  outboundApiToken: string
  outboundWebhook: IntegrationOutboundWebhookConfig | null
  projectMapping: string | null
  onOutboundApiTokenChange: (value: string) => void
  onSaveOutboundWebhook: () => void
}

export function JiraOutboundWebhookSection({
  isSavingWebhook,
  outboundApiToken,
  outboundWebhook,
  projectMapping,
  onOutboundApiTokenChange,
  onSaveOutboundWebhook,
}: JiraOutboundWebhookSectionProps) {
  const issuePreview = projectMapping ? `${projectMapping}-123` : 'Resolved from inbound ticket metadata'
  const saveDisabled = isSavingWebhook || (!outboundWebhook && outboundApiToken.trim().length === 0)

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Jira Feedback</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Publish job lifecycle feedback back to the originating Jira issue.
      </Text>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Always-on feedback events</p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Viberglass always sends `job_started` and `job_ended` updates to the Jira issue linked to the ticket.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">Jira project key: {projectMapping || 'Not configured'}</code>
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">Issue: {issuePreview}</code>
        </div>
        {!projectMapping && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Save an inbound Jira project key to strengthen project-scoped outbound config matching.
          </p>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-900 dark:text-white">Jira API token</label>
          <input
            type="password"
            value={outboundApiToken}
            onChange={(event) => onOutboundApiTokenChange(event.target.value)}
            placeholder={outboundWebhook?.hasApiToken ? 'Stored token (leave empty to keep)' : 'Enter API token'}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            Use an API token with Jira permissions for issue comments and transitions. Rotate regularly and leave
            this field empty after rotation to keep the stored token.
          </p>
        </div>

        <div className="border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button color="brand" onClick={onSaveOutboundWebhook} disabled={saveDisabled}>
            {isSavingWebhook ? 'Saving...' : outboundWebhook ? 'Save feedback settings' : 'Enable feedback'}
          </Button>
        </div>
      </div>
    </section>
  )
}
