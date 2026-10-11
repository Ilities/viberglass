import { Button } from '@/components/button'
import { Description, Label } from '@/components/fieldset'
import { Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { Text } from '@/components/text'
import type { ConnectionSpaceRule } from '@/service/api/integration-api'
import type { TrackerWebhookDescriptor } from '@viberglass/integration-core/frontend'
import { CopyIcon } from '@radix-ui/react-icons'
import { DeliveryHistoryTable } from './DeliveryHistoryTable'
import { useTicketUrlBuilder } from './deliveryUtils'
import type { useIntegrationWebhookSettings } from './useIntegrationWebhookSettings'

interface TrackerWebhookSectionProps {
  tracker: TrackerWebhookDescriptor
  webhook: ReturnType<typeof useIntegrationWebhookSettings>
  spaceRules: ConnectionSpaceRule[]
  projects: Array<{ id: string; name: string; slug?: string }> | null
}

const fieldClass =
  'flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 font-mono text-sm text-[var(--gray-12)]'

/**
 * A tracker connection's one webhook: where the tracker sends its events, and
 * what came in. Which issues become tasks is each space's to say.
 */
export function TrackerWebhookSection({ tracker, webhook, spaceRules, projects }: TrackerWebhookSectionProps) {
  const getTicketUrl = useTicketUrlBuilder(projects)
  const config = webhook.selectedInboundConfig

  return (
    <section className="app-frame rounded-lg p-6">
      <Subheading>Webhook</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        {tracker.tracker} sends its {tracker.items} here. Each space chooses which of them become its tasks, in the space&apos;s
        settings under Incoming issues.
      </Text>

      {webhook.isLoadingWebhook ? (
        <Text className="mt-4 text-sm">Loading…</Text>
      ) : !config ? (
        <div className="mt-4">
          <Button color="brand" onClick={() => void webhook.handleCreateInboundWebhook()} disabled={webhook.isSavingWebhook}>
            {webhook.isSavingWebhook ? 'Setting up…' : 'Set up the webhook'}
          </Button>
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          <div className="rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
            <p className="text-sm font-medium text-[var(--gray-12)]">Adding it in {tracker.tracker}</p>
            <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-[var(--gray-9)]">
              {tracker.setupSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </div>

          <div>
            <Label>Webhook URL</Label>
            <div className="mt-1 flex gap-2">
              <input aria-label="Webhook URL" type="text" readOnly value={config.webhookUrl} className={fieldClass} />
              <Button outline onClick={() => void webhook.handleCopyWebhookUrl(config.webhookUrl)} title="Copy URL">
                <CopyIcon className="size-4" />
              </Button>
            </div>
          </div>

          <div>
            <Label>Secret</Label>
            <div className="mt-1 flex flex-wrap gap-2">
              <input
                aria-label="Secret"
                type={webhook.showSecret ? 'text' : 'password'}
                readOnly
                value={config.webhookSecret || (config.hasSecret ? '(stored, hidden)' : '(none)')}
                className={`min-w-72 ${fieldClass}`}
              />
              <Button outline onClick={() => webhook.setShowSecret(!webhook.showSecret)}>
                {webhook.showSecret ? 'Hide' : 'Show'}
              </Button>
              <Button outline onClick={() => void webhook.handleCopyWebhookSecret()}>
                Copy
              </Button>
              <Button outline onClick={() => void webhook.handleGenerateSecret()} disabled={webhook.isSavingWebhook}>
                Regenerate
              </Button>
            </div>
            <Description>The secret is shown once, when it&apos;s made. Regenerate it to see a new one.</Description>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-[var(--gray-12)]">Events</legend>
            <div className="mt-2 space-y-3">
              {tracker.events.map((option) => (
                <label key={option.value} className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={webhook.inboundEvents.includes(option.value)}
                    onChange={(event) => webhook.handleToggleInboundEvent(option.value, event.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)] text-[var(--accent-9)] focus:ring-[var(--accent-9)]"
                  />
                  <span>
                    <span className="text-sm text-[var(--gray-12)]">{option.label}</span>
                    <span className="block text-xs text-[var(--gray-9)]">{option.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="max-w-md">
            <Label htmlFor="trackerBotUsername">Bot account</Label>
            <Input
              id="trackerBotUsername"
              value={webhook.botUsername}
              onChange={(event) => webhook.setBotUsername(event.target.value)}
              placeholder={tracker.botUsernamePlaceholder}
            />
            <Description>{tracker.botUsernameHint}</Description>
          </div>

          {webhook.hasInboundChanges && (
            <Button color="brand" onClick={() => void webhook.handleSaveInboundWebhook()} disabled={webhook.isSavingWebhook}>
              {webhook.isSavingWebhook ? 'Saving…' : 'Save'}
            </Button>
          )}

          <SpacesTakingIssues tracker={tracker} rules={spaceRules} />

          <DeliveryHistoryTable
            title="Deliveries"
            emptyMessage={`Nothing has arrived from ${tracker.tracker} yet.`}
            deliveries={webhook.deliveries}
            isLoadingDeliveries={webhook.isLoadingDeliveries}
            onRefreshDeliveries={() => void webhook.handleRefreshDeliveries()}
            onRetryDelivery={(deliveryId) => void webhook.handleRetryDelivery(deliveryId)}
            getTicketUrl={getTicketUrl}
          />

          <div className="border-t border-[var(--gray-6)] pt-4">
            <Button color="red" onClick={() => void webhook.handleDeleteInboundWebhook()} disabled={webhook.isSavingWebhook}>
              Remove the webhook
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

function SpacesTakingIssues({ tracker, rules }: { tracker: TrackerWebhookDescriptor; rules: ConnectionSpaceRule[] }) {
  const spaces = new Map<string, { name: string; slug: string; labels: string[]; everything: boolean; plans: boolean }>()
  for (const rule of rules) {
    const space = spaces.get(rule.projectId) ?? { name: rule.projectName, slug: rule.projectSlug, labels: [], everything: false, plans: false }
    if (rule.label) space.labels.push(rule.label)
    else space.everything = true
    space.plans ||= rule.planNewIssues
    spaces.set(rule.projectId, space)
  }

  return (
    <div className="border-t border-[var(--gray-6)] pt-4">
      <h4 className="text-sm font-medium text-[var(--gray-12)]">Spaces taking its {tracker.items}</h4>
      {tracker.issuesInRepository && (
        <Text className="mt-1 text-xs">Each space takes only the {tracker.items} in its own repository.</Text>
      )}
      {spaces.size === 0 ? (
        <Text className="mt-2 text-sm">
          No space takes {tracker.items} yet. A space chooses which it takes in its settings, under Incoming issues.
        </Text>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {[...spaces.values()].map((space) => (
            <li key={space.slug}>
              <Link href={`/spaces/${space.slug}/settings/issues`}>{space.name}</Link>
              <span className="text-[var(--gray-10)]">
                {' '}
                · {space.everything ? `every ${tracker.item}` : `labelled ${space.labels.join(', ')}`}
                {space.plans ? ' · writes the plan' : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
