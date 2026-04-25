import { Button } from '@viberglass/platform-ui'
import { Subheading } from '@viberglass/platform-ui'
import { Text } from '@viberglass/platform-ui'
import type { OutboundWebhookSectionProps } from '@viberglass/integration-core/frontend'

export function ShortcutOutboundWebhookSection({
  isSavingWebhook,
  outboundApiToken,
  outboundWebhook,
  providerProjectMapping,
  onOutboundApiTokenChange,
  onSaveOutboundWebhook,
}: OutboundWebhookSectionProps) {
  const projectMapping = providerProjectMapping ?? null
  const storyPreview = projectMapping ? `${projectMapping}/story/101` : 'Any story resolved from ticket metadata'
  const saveDisabled = isSavingWebhook || (!outboundWebhook && outboundApiToken.trim().length === 0)

  return (
    <section className="app-frame rounded-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-20M22 12l-8-8M22 12l-8 8" />
          </svg>
        </div>
      </div>
      <Subheading>Shortcut Feedback</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        Publish job lifecycle feedback back to the originating Shortcut story.
      </Text>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">Always-on feedback events</p>
        <p className="mt-1 text-xs text-[var(--gray-9)]">
          Viberglass always sends `job_started` and `job_ended` updates to the story attached to the created ticket.
        </p>
        <div className="mt-2 flex flex-wrap gap-2 text-xs">
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">
            Shortcut project ID: {projectMapping || 'Not configured'}
          </code>
          <code className="rounded bg-zinc-200 px-2 py-1 dark:bg-zinc-700">Story target: {storyPreview}</code>
        </div>
        {!projectMapping && (
          <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
            Save an inbound Shortcut project ID to strengthen project-scoped outbound config matching.
          </p>
        )}
      </div>

      <div className="mt-6 space-y-6">
        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">Shortcut API token</label>
          <input
            type="password"
            value={outboundApiToken}
            onChange={(event) => onOutboundApiTokenChange(event.target.value)}
            placeholder={outboundWebhook?.hasApiToken ? 'Stored token (leave empty to keep)' : 'Enter API token'}
            className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
          />
          <p className="mt-1.5 text-xs text-[var(--gray-9)]">
            Use a Shortcut token that can comment on stories and update labels/workflow states. Rotate regularly and
            leave this field empty after rotation to keep the stored token.
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
