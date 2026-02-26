import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import type { IntegrationInboundWebhookConfig, IntegrationWebhookDelivery } from '@/service/api/integration-api'
import { CopyIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
import { DeliveryHistoryTable } from './DeliveryHistoryTable'
import { useTicketUrlBuilder } from './deliveryUtils'

interface CustomInboundWebhookSectionProps {
  autoExecute: boolean
  deliveries: IntegrationWebhookDelivery[]
  hasInboundChanges: boolean
  inboundActive: boolean
  inboundWebhooks: IntegrationInboundWebhookConfig[]
  isLoadingDeliveries: boolean
  isLoadingWebhook: boolean
  isSavingWebhook: boolean
  projects: Array<{ id: string; name: string }> | null
  selectedInboundConfig: IntegrationInboundWebhookConfig | null
  selectedInboundConfigId: string | null
  selectedProjectId: string | null
  showSecret: boolean
  onAutoExecuteChange: (value: boolean) => void
  onCopyWebhookSecret: () => void
  onCopyWebhookUrl: (url: string) => void
  onCreateInboundWebhook: (projectId: string | null) => void
  onDeleteInboundWebhook: () => void
  onGenerateSecret: () => void
  onInboundActiveChange: (value: boolean) => void
  onProjectChange: (projectId: string | null) => void
  onRefreshDeliveries: () => void
  onRetryDelivery: (deliveryId: string) => void
  onSaveWebhook: () => void
  onSelectInboundWebhook: (configId: string) => void
  onToggleSecretVisibility: () => void
}

const CUSTOM_PAYLOAD_EXAMPLE = `{
  "title": "string (required)",
  "description": "string (required)",
  "severity": "low | medium | high | critical (optional)",
  "category": "string (optional, default: \\"bug\\")",
  "externalId": "string (optional)",
  "url": "string (optional)"
}`

const NODE_TEST_WEBHOOK_SNIPPET = `# Requires Node.js 18+ (for built-in fetch)
WEBHOOK_URL="<your-webhook-url>"
WEBHOOK_SECRET="<your-webhook-secret>"

node - <<'NODE'
const crypto = require('crypto');

const url = process.env.WEBHOOK_URL;
const secret = process.env.WEBHOOK_SECRET;

if (!url || !secret) {
  console.error("Set WEBHOOK_URL and WEBHOOK_SECRET env vars");
  process.exit(1);
}

const raw = Buffer.from(JSON.stringify({
  title: "Example ticket",
  description: "Hello from a signed custom inbound webhook"
}), "utf8");

const signature =
  "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");

fetch(url, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "X-Webhook-Signature-256": signature,
  },
  body: raw,
}).then(async (res) => {
  console.log("Status:", res.status);
  console.log(await res.text());
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
NODE
`

export function CustomInboundWebhookSection({
  autoExecute,
  deliveries,
  hasInboundChanges,
  inboundActive,
  inboundWebhooks,
  isLoadingDeliveries,
  isLoadingWebhook,
  isSavingWebhook,
  projects,
  selectedInboundConfig,
  selectedInboundConfigId,
  selectedProjectId,
  showSecret,
  onAutoExecuteChange,
  onCopyWebhookSecret,
  onCopyWebhookUrl,
  onCreateInboundWebhook,
  onDeleteInboundWebhook,
  onGenerateSecret,
  onInboundActiveChange,
  onProjectChange,
  onRefreshDeliveries,
  onRetryDelivery,
  onSaveWebhook,
  onSelectInboundWebhook,
  onToggleSecretVisibility,
}: CustomInboundWebhookSectionProps) {
  const getTicketUrl = useTicketUrlBuilder(projects)

  const [isExampleExpanded, setIsExampleExpanded] = useState(true)
  const [isNodeSnippetExpanded, setIsNodeSnippetExpanded] = useState(false)

  const onCopyNodeSnippet = async () => {
    try {
      await navigator.clipboard.writeText(NODE_TEST_WEBHOOK_SNIPPET)
    } catch {
      // Clipboard can fail due to permissions; no-op (user can still select + copy manually)
    }
  }

  return (
    <section className="app-frame rounded-lg p-6">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent-3)] text-[var(--accent-9)]">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        </div>
      </div>
      <Subheading>Custom Inbound Webhooks</Subheading>
      <Text className="text-sm text-[var(--gray-9)]">
        Manage multiple custom inbound endpoints with isolated URLs, secrets, and delivery history.
      </Text>

      <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
        <p className="text-sm font-medium text-[var(--gray-12)]">Custom setup steps</p>
        <ol className="mt-2 list-inside list-decimal space-y-1 text-xs text-[var(--gray-9)]">
          <li>Create one endpoint per upstream source that should send tickets independently.</li>
          <li>
            Send <code>POST</code> requests using the selected endpoint URL and payload shape shown below.
          </li>
          <li>Sign the raw request body with the endpoint secret using HMAC-SHA256.</li>
        </ol>
      </div>

      {isLoadingWebhook ? (
        <div className="mt-4 text-sm text-[var(--gray-9)]">Loading custom webhook configuration...</div>
      ) : (
        <div className="mt-6 space-y-6">
          {inboundWebhooks.length === 0 ? (
            <Button color="brand" onClick={() => onCreateInboundWebhook(selectedProjectId)} disabled={isSavingWebhook}>
              {isSavingWebhook ? 'Setting up...' : 'Create custom inbound endpoint'}
            </Button>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
              <div className="space-y-2">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium text-[var(--gray-12)]">Inbound endpoints</p>
                  <Button
                    color="zinc"
                    size="small"
                    onClick={() => onCreateInboundWebhook(selectedProjectId)}
                    disabled={isSavingWebhook}
                  >
                    Add
                  </Button>
                </div>

                {inboundWebhooks.map((config, index) => {
                  const isSelected = config.id === selectedInboundConfigId
                  return (
                    <button
                      key={config.id}
                      type="button"
                      onClick={() => onSelectInboundWebhook(config.id)}
                      className={[
                        'w-full rounded-md border px-3 py-2 text-left transition',
                        isSelected
                          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-950/20'
                          : 'border-[var(--gray-6)] bg-[var(--gray-2)] hover:border-[var(--gray-7)]',
                      ].join(' ')}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-[var(--gray-12)]">{`Endpoint ${index + 1}`}</span>
                        <Badge color={config.active ? 'green' : 'amber'}>{config.active ? 'Active' : 'Disabled'}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--gray-9)]">{config.id.slice(0, 12)}</p>
                    </button>
                  )
                })}
              </div>

              {selectedInboundConfig ? (
                <div className="space-y-4">
                  {projects && projects.length > 0 && (
                    <div className="pt-2">
                      <label className="block text-xs font-medium tracking-wider text-[var(--gray-9)] uppercase">
                        Link to Project
                      </label>
                      <select
                        value={selectedProjectId ?? ''}
                        onChange={(event) => onProjectChange(event.target.value || null)}
                        className="mt-1 w-full rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 text-sm text-[var(--gray-12)]"
                      >
                        <option value="">Global (all projects)</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1.5 text-xs text-[var(--gray-9)]">
                        Tickets from this webhook will be assigned to the selected project.
                      </p>
                    </div>
                  )}

                  <div className="pt-2">
                    <label className="block text-xs font-medium tracking-wider text-[var(--gray-9)] uppercase">
                      Webhook URL
                    </label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="text"
                        readOnly
                        value={selectedInboundConfig.webhookUrl}
                        className="flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 font-mono text-sm text-[var(--gray-12)]"
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
                    <label className="block text-xs font-medium tracking-wider text-[var(--gray-9)] uppercase">
                      Webhook secret
                    </label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <input
                        type={showSecret ? 'text' : 'password'}
                        readOnly
                        value={
                          selectedInboundConfig.webhookSecret ||
                          (selectedInboundConfig.hasSecret ? '(stored, hidden)' : '(none)')
                        }
                        className="min-w-72 flex-1 rounded-md border border-[var(--gray-7)] bg-[var(--gray-2)] px-3 py-2 font-mono text-sm text-[var(--gray-12)]"
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
                      Use this secret to compute <code>X-Webhook-Signature-256</code> with HMAC-SHA256 over the raw
                      payload.
                    </p>
                  </div>

                  <div className="rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-3">
                    <p className="text-xs font-medium text-[var(--gray-9)]">Inbound event type</p>
                    <p className="mt-1 text-sm text-[var(--gray-12)]">
                      <code>ticket_created</code>
                    </p>
                  </div>

                  <div className="space-y-2">
                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="customInboundActive"
                        checked={inboundActive}
                        onChange={(event) => onInboundActiveChange(event.target.checked)}
                        className="h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)] text-[var(--accent-9)] focus:ring-[var(--accent-9)]"
                      />
                      <span className="text-sm text-[var(--gray-12)]">Enable this inbound endpoint</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="customInboundAutoExecute"
                        checked={autoExecute}
                        onChange={(event) => onAutoExecuteChange(event.target.checked)}
                        className="h-4 w-4 rounded border-[var(--gray-7)] bg-[var(--gray-3)] text-[var(--accent-9)] focus:ring-[var(--accent-9)]"
                      />
                      <span className="text-sm text-[var(--gray-12)]">
                        Auto-execute fixes for accepted inbound events
                      </span>
                    </label>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {hasInboundChanges && (
                      <Button color="brand" onClick={onSaveWebhook} disabled={isSavingWebhook}>
                        {isSavingWebhook ? 'Saving...' : 'Save endpoint settings'}
                      </Button>
                    )}
                    <Button color="red" onClick={onDeleteInboundWebhook} disabled={isSavingWebhook}>
                      Remove selected endpoint
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border border-[var(--gray-6)] p-4 text-sm text-[var(--gray-9)]">
                  Select an endpoint to view its details.
                </div>
              )}
            </div>
          )}

          {selectedInboundConfig && (
            <div className="rounded-md border border-[var(--gray-6)] bg-[var(--gray-3)] p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--gray-12)]">Expected payload format</p>
                  <p className="mt-1 text-xs text-[var(--gray-9)]">Example payload + required headers + test script.</p>
                </div>

                <Button
                  color="zinc"
                  size="small"
                  onClick={() => setIsExampleExpanded((v) => !v)}
                  title={isExampleExpanded ? 'Collapse examples' : 'Expand examples'}
                >
                  {isExampleExpanded ? 'Hide' : 'Show'}
                </Button>
              </div>

              {isExampleExpanded && (
                <>
                  <pre className="mt-3 overflow-x-auto text-xs text-[var(--gray-9)]">{CUSTOM_PAYLOAD_EXAMPLE}</pre>

                  <p className="mt-2 text-xs text-[var(--gray-9)]">
                    Required header:{' '}
                    <code className="rounded bg-[var(--gray-6)] px-1 py-0.5">
                      X-Webhook-Signature-256: sha256=&lt;hmac_hex&gt;
                    </code>
                  </p>

                  <p className="mt-1 text-xs text-[var(--gray-9)]">
                    Optional idempotency header:{' '}
                    <code className="rounded bg-[var(--gray-6)] px-1 py-0.5">
                      X-Webhook-Delivery-Id: &lt;unique-id&gt;
                    </code>
                  </p>

                  <div className="mt-4 rounded-md border border-[var(--gray-6)] bg-[var(--gray-2)] p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-[var(--gray-12)]">Example test code (Node.js)</p>
                      <div className="flex items-center gap-2">
                        <Button
                          color="zinc"
                          size="small"
                          onClick={() => setIsNodeSnippetExpanded((v) => !v)}
                          title={isNodeSnippetExpanded ? 'Collapse script' : 'Expand script'}
                        >
                          {isNodeSnippetExpanded ? 'Hide' : 'Show'}
                        </Button>
                        <Button color="zinc" size="small" onClick={onCopyNodeSnippet} title="Copy test script">
                          <CopyIcon className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {isNodeSnippetExpanded && (
                      <p className="mt-1 text-xs text-[var(--gray-9)]">
                        Copy, paste into a terminal, set <code>WEBHOOK_URL</code> and <code>WEBHOOK_SECRET</code>, then
                        run.
                      </p>
                    )}
                    <pre
                      className={[
                        'mt-2 overflow-x-auto rounded bg-[var(--gray-3)] p-3 text-[11px] leading-relaxed text-[var(--gray-9)]',
                        isNodeSnippetExpanded ? 'max-h-[28rem] overflow-y-auto' : 'hidden',
                      ].join(' ')}
                    >
                      {NODE_TEST_WEBHOOK_SNIPPET}
                    </pre>
                  </div>
                </>
              )}
            </div>
          )}

          <DeliveryHistoryTable
            title="Delivery history"
            emptyMessage="No deliveries yet for the selected inbound endpoint."
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
