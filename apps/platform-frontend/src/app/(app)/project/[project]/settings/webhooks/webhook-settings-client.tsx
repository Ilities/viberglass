'use client'

import { Button } from '@/components/button'
import { Checkbox, CheckboxField } from '@/components/checkbox'
import { Divider } from '@/components/divider'
import { Description, Field, Label } from '@/components/fieldset'
import { Heading, Subheading } from '@/components/heading'
import { Input } from '@/components/input'
import { Text } from '@/components/text'
import type { TicketSystem } from '@viberglass/types'
import { useState } from 'react'

const SUPPORTED_WEBHOOK_SYSTEMS = ['github', 'jira', 'linear'] as const
type WebhookSystem = (typeof SUPPORTED_WEBHOOK_SYSTEMS)[number]

interface WebhookSettingsClientProps {
  project: string
  configuredWebhookSystems: TicketSystem[]
  integrationsLoadError: string | null
}

export function WebhookSettingsClient({
  project,
  configuredWebhookSystems,
  integrationsLoadError,
}: WebhookSettingsClientProps) {
  const availableSystems = SUPPORTED_WEBHOOK_SYSTEMS.filter((system) =>
    configuredWebhookSystems.includes(system)
  )
  const hasAvailableSystems = availableSystems.length > 0

  const [enabledSystems, setEnabledSystems] = useState<Record<WebhookSystem, boolean>>(() => ({
    github: availableSystems.includes('github'),
    jira: availableSystems.includes('jira'),
    linear: availableSystems.includes('linear'),
  }))

  const toggleSystem = (system: WebhookSystem) => {
    setEnabledSystems((prev) => ({
      ...prev,
      [system]: !prev[system],
    }))
  }

  return (
    <div className="space-y-8 p-6 lg:p-8">
      <div>
        <Heading>Webhook Settings</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Configure webhooks to receive updates from your ticketing systems.
        </p>
      </div>

      <form className="space-y-8">
        <section>
          <Subheading>Webhook Configuration</Subheading>
          <Text>Configure webhooks to receive updates from your ticketing systems.</Text>

          <Divider className="my-6" />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Enabled Webhook Systems</Text>
            <Text>Select which ticketing systems you want to receive webhooks from.</Text>

            {integrationsLoadError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                {integrationsLoadError}
              </div>
            )}

            {hasAvailableSystems ? (
              <div className="grid gap-4 sm:grid-cols-3">
                {availableSystems.includes('github') && (
                  <CheckboxField>
                    <Checkbox
                      checked={enabledSystems.github}
                      onChange={() => toggleSystem('github')}
                      name="enable_github_webhooks"
                    />
                    <Label>GitHub</Label>
                  </CheckboxField>
                )}
                {availableSystems.includes('jira') && (
                  <CheckboxField>
                    <Checkbox
                      checked={enabledSystems.jira}
                      onChange={() => toggleSystem('jira')}
                      name="enable_jira_webhooks"
                    />
                    <Label>Jira</Label>
                  </CheckboxField>
                )}
                {availableSystems.includes('linear') && (
                  <CheckboxField>
                    <Checkbox
                      checked={enabledSystems.linear}
                      onChange={() => toggleSystem('linear')}
                      name="enable_linear_webhooks"
                    />
                    <Label>Linear</Label>
                  </CheckboxField>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
                <Text className="text-sm font-semibold text-zinc-950 dark:text-white">
                  No webhook integrations configured
                </Text>
                <Text className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  Configure integrations at the application level to enable webhook options here.
                </Text>
                <Button href="/settings/integrations" color="brand" className="mt-4">
                  Configure Integrations
                </Button>
              </div>
            )}
          </div>

          <div className="space-y-6">
            {enabledSystems.github && (
              <div>
                <Text className="text-sm font-medium text-zinc-950 dark:text-white">GitHub Webhooks</Text>
                <Text>Configure GitHub webhook for issue updates and auto-fix triggers.</Text>

                <div className="mt-4 space-y-4">
                  <Field>
                    <Label>Webhook URL</Label>
                    <div className="flex gap-2">
                      <Input readOnly value="https://api.viberglass.com/api/webhooks/github" className="flex-1" />
                      <Button type="button" plain>
                        Copy
                      </Button>
                    </div>
                  </Field>
                  <Field>
                    <Label>Webhook Secret</Label>
                    <Input
                      type="password"
                      aria-label="GitHub Webhook Secret"
                      name="github_webhook_secret"
                      placeholder="your-webhook-secret"
                    />
                  </Field>
                  <div className="space-y-2">
                    <Text className="text-sm font-medium text-zinc-950 dark:text-white">GitHub Webhook Events</Text>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <CheckboxField>
                        <Checkbox name="github_issues" defaultChecked />
                        <Label className="text-sm">Issues</Label>
                      </CheckboxField>
                      <CheckboxField>
                        <Checkbox name="github_issue_comment" defaultChecked />
                        <Label className="text-sm">Issue Comments</Label>
                      </CheckboxField>
                      <CheckboxField>
                        <Checkbox name="github_pull_request" />
                        <Label className="text-sm">Pull Requests</Label>
                      </CheckboxField>
                      <CheckboxField>
                        <Checkbox name="github_push" />
                        <Label className="text-sm">Push</Label>
                      </CheckboxField>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {enabledSystems.jira && (
              <>
                <Divider className="my-6" soft />
                <div>
                  <Text className="text-sm font-medium text-zinc-950 dark:text-white">Jira Webhooks</Text>
                  <Text>Configure Jira webhook for issue updates.</Text>

                  <div className="mt-4 space-y-4">
                    <Field>
                      <Label>Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input readOnly value="https://api.viberglass.io/api/webhooks/jira" className="flex-1" />
                        <Button type="button" plain>
                          Copy
                        </Button>
                      </div>
                    </Field>
                    <div>
                      <Text className="text-sm font-medium text-zinc-950 dark:text-white">Jira Webhook Events</Text>
                      <div className="mt-2 space-y-2">
                        <CheckboxField>
                          <Checkbox name="jira_issue_created" defaultChecked />
                          <Label className="text-sm">Issue Created</Label>
                        </CheckboxField>
                        <CheckboxField>
                          <Checkbox name="jira_issue_updated" defaultChecked />
                          <Label className="text-sm">Issue Updated</Label>
                        </CheckboxField>
                        <CheckboxField>
                          <Checkbox name="jira_issue_deleted" />
                          <Label className="text-sm">Issue Deleted</Label>
                        </CheckboxField>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}

            {enabledSystems.linear && (
              <>
                <Divider className="my-6" soft />
                <div>
                  <Text className="text-sm font-medium text-zinc-950 dark:text-white">Linear Webhooks</Text>
                  <Text>Configure Linear webhook for issue updates.</Text>

                  <div className="mt-4 space-y-4">
                    <Field>
                      <Label>Webhook URL</Label>
                      <div className="flex gap-2">
                        <Input readOnly value="https://api.viberglass.io/api/webhooks/linear" className="flex-1" />
                        <Button type="button" plain>
                          Copy
                        </Button>
                      </div>
                    </Field>
                    <div>
                      <Text className="text-sm font-medium text-zinc-950 dark:text-white">Linear Webhook Events</Text>
                      <div className="mt-2 space-y-2">
                        <CheckboxField>
                          <Checkbox name="linear_issue_created" defaultChecked />
                          <Label className="text-sm">Issue Created</Label>
                        </CheckboxField>
                        <CheckboxField>
                          <Checkbox name="linear_issue_updated" defaultChecked />
                          <Label className="text-sm">Issue Updated</Label>
                        </CheckboxField>
                        <CheckboxField>
                          <Checkbox name="linear_comment_created" />
                          <Label className="text-sm">Comment Created</Label>
                        </CheckboxField>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Auto-Fix Triggers</Text>
            <Text>Configure what triggers automatic fix attempts.</Text>

            <div className="space-y-3">
              <Field>
                <Label>GitHub Labels/Title Prefixes</Label>
                <Input
                  aria-label="GitHub Auto-fix Labels"
                  name="github_autofix_labels"
                  defaultValue="auto-fix,ai-fix,🤖 auto-fix"
                />
                <Description>Comma-separated list of labels that trigger auto-fix</Description>
              </Field>

              <Field>
                <Label>Title Prefixes</Label>
                <Input
                  aria-label="Auto-fix Title Prefixes"
                  name="autofix_title_prefixes"
                  defaultValue="[AUTO-FIX],[AI-FIX]"
                />
              </Field>

              <Field>
                <Label>Description Markers</Label>
                <Input
                  aria-label="Auto-fix Description Markers"
                  name="autofix_description_markers"
                  defaultValue="<!-- AUTO-FIX -->"
                />
              </Field>
            </div>
          </div>

          <Divider className="my-6" soft />

          <div className="space-y-4">
            <Text className="text-sm font-medium text-zinc-950 dark:text-white">Webhook Security</Text>
            <div className="grid gap-4 sm:grid-cols-2">
              <CheckboxField>
                <Checkbox name="verify_webhook_signatures" defaultChecked />
                <Label>Verify webhook signatures</Label>
              </CheckboxField>
              <CheckboxField>
                <Checkbox name="enable_webhook_logs" defaultChecked />
                <Label>Log all webhook events</Label>
              </CheckboxField>
            </div>
          </div>
        </section>

        <Divider className="my-10" soft />

        <div className="flex justify-end gap-4">
          <Button type="reset" plain>
            Reset
          </Button>
          <Button type="submit">Save changes</Button>
        </div>
      </form>
    </div>
  )
}
