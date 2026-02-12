import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type { IntegrationOutboundWebhookConfig } from '@/service/api/integration-api'

interface OutboundWebhookSectionProps {
  emitJobEnded: boolean
  emitJobStarted: boolean
  hasOutboundChanges: boolean
  isSavingWebhook: boolean
  outboundApiToken: string
  outboundWebhook: IntegrationOutboundWebhookConfig | null
  onDeleteOutboundWebhook: () => void
  onEmitJobEndedChange: (value: boolean) => void
  onEmitJobStartedChange: (value: boolean) => void
  onOutboundApiTokenChange: (value: string) => void
  onSaveOutboundWebhook: () => void
}

export function OutboundWebhookSection({
  emitJobEnded,
  emitJobStarted,
  hasOutboundChanges,
  isSavingWebhook,
  outboundApiToken,
  outboundWebhook,
  onDeleteOutboundWebhook,
  onEmitJobEndedChange,
  onEmitJobStartedChange,
  onOutboundApiTokenChange,
  onSaveOutboundWebhook,
}: OutboundWebhookSectionProps) {
  return (
    <section className="app-frame rounded-lg p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 12h-20M22 12l-8-8M22 12l-8 8" />
          </svg>
        </div>
      </div>
      <Subheading>Outbound Webhooks</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        Outbound webhooks send job lifecycle events when execution starts and ends.
      </Text>

      <div className="mt-6 space-y-6">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="emitJobStarted"
            checked={emitJobStarted}
            onChange={(e) => onEmitJobStartedChange(e.target.checked)}
            className="text-[var(--accent-9)] focus:ring-[var(--accent-9)] h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)]"
          />
          <label htmlFor="emitJobStarted" className="text-sm text-[var(--gray-12)]">
            Send `job_started` event
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="emitJobEnded"
            checked={emitJobEnded}
            onChange={(e) => onEmitJobEndedChange(e.target.checked)}
            className="text-[var(--accent-9)] focus:ring-[var(--accent-9)] h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)]"
          />
          <label htmlFor="emitJobEnded" className="text-sm text-[var(--gray-12)]">
            Send `job_ended` event
          </label>
        </div>

        <div>
          <label className="block text-xs font-medium uppercase tracking-wider text-[var(--gray-9)]">API Token</label>
          <input
            type="password"
            value={outboundApiToken}
            onChange={(e) => onOutboundApiTokenChange(e.target.value)}
            placeholder={outboundWebhook?.hasApiToken ? 'Stored token (leave empty to keep)' : 'Enter API token'}
            className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
          />
        </div>

        <div className="flex gap-3 border-t border-zinc-200 pt-4 dark:border-zinc-800">
          <Button color="brand" onClick={onSaveOutboundWebhook} disabled={isSavingWebhook || !hasOutboundChanges}>
            {isSavingWebhook ? 'Saving...' : outboundWebhook ? 'Save Outbound Settings' : 'Setup Outbound Webhook'}
          </Button>
          {outboundWebhook && (
            <Button color="red" onClick={onDeleteOutboundWebhook} disabled={isSavingWebhook}>
              Remove Outbound Webhook
            </Button>
          )}
        </div>
      </div>
    </section>
  )
}
