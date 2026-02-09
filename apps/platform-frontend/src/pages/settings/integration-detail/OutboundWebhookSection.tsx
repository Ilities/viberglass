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
    <section className="rounded-xl border border-zinc-950/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">
      <Subheading>Outbound Webhooks</Subheading>
      <Text className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Outbound webhooks send job lifecycle events when execution starts and ends.
      </Text>

      <div className="mt-4 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="emitJobStarted"
            checked={emitJobStarted}
            onChange={(e) => onEmitJobStartedChange(e.target.checked)}
            className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          <label htmlFor="emitJobStarted" className="text-sm text-zinc-900 dark:text-white">
            Send `job_started` event
          </label>
        </div>

        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="emitJobEnded"
            checked={emitJobEnded}
            onChange={(e) => onEmitJobEndedChange(e.target.checked)}
            className="text-brand-600 focus:ring-brand-600 h-4 w-4 rounded border-zinc-300 dark:border-zinc-700"
          />
          <label htmlFor="emitJobEnded" className="text-sm text-zinc-900 dark:text-white">
            Send `job_ended` event
          </label>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-900 dark:text-white">API Token</label>
          <input
            type="password"
            value={outboundApiToken}
            onChange={(e) => onOutboundApiTokenChange(e.target.value)}
            placeholder={outboundWebhook?.hasApiToken ? 'Stored token (leave empty to keep)' : 'Enter API token'}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
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
