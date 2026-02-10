import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type { IntegrationOutboundWebhookConfig } from '@/service/api/integration-api'

interface JiraOutboundWebhookSectionProps {
  emitJobEnded: boolean
  emitJobStarted: boolean
  hasOutboundChanges: boolean
  isSavingWebhook: boolean
  outboundApiToken: string
  outboundWebhook: IntegrationOutboundWebhookConfig | null
  projectMapping: string | null
  onDeleteOutboundWebhook: () => void
  onEmitJobEndedChange: (value: boolean) => void
  onEmitJobStartedChange: (value: boolean) => void
  onOutboundApiTokenChange: (value: string) => void
  onSaveOutboundWebhook: () => void
}

export function JiraOutboundWebhookSection({
  emitJobEnded,
  emitJobStarted,
  hasOutboundChanges,
  isSavingWebhook,
  outboundApiToken,
  outboundWebhook,
  projectMapping,
  onDeleteOutboundWebhook,
  onEmitJobEndedChange,
  onEmitJobStartedChange,
  onOutboundApiTokenChange,
  onSaveOutboundWebhook,
}: JiraOutboundWebhookSectionProps) {
  const issuePreview = projectMapping ? `${projectMapping}-123` : 'Project key is required'

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Jira Outbound Events</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Send job lifecycle feedback back to Jira issues and comments.
      </Text>

      <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800">
        <p className="text-sm font-medium text-zinc-900 dark:text-white">Jira mapping preview</p>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
          Outbound routing uses this Jira project key and issue key pattern:
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">
            Project: {projectMapping || 'Missing'}
          </code>
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">Issue: {issuePreview}</code>
        </div>
        {!projectMapping && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Save a Jira Project Key in integration configuration before saving outbound webhook settings.
          </p>
        )}
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="jiraEmitJobStarted"
            checked={emitJobStarted}
            onChange={(event) => onEmitJobStartedChange(event.target.checked)}
            className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          <label htmlFor="jiraEmitJobStarted" className="text-sm text-zinc-900 dark:text-white">
            Publish `job_started` status comment
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="jiraEmitJobEnded"
            checked={emitJobEnded}
            onChange={(event) => onEmitJobEndedChange(event.target.checked)}
            className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          <label htmlFor="jiraEmitJobEnded" className="text-sm text-zinc-900 dark:text-white">
            Publish `job_ended` completion/failure summary
          </label>
        </div>

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

        <div className="flex gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button
            color="brand"
            onClick={onSaveOutboundWebhook}
            disabled={isSavingWebhook || !hasOutboundChanges || !projectMapping}
          >
            {isSavingWebhook ? 'Saving...' : outboundWebhook ? 'Save outbound settings' : 'Create outbound config'}
          </Button>
          {outboundWebhook && (
            <Button color="red" onClick={onDeleteOutboundWebhook} disabled={isSavingWebhook}>
              Remove outbound webhook
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
