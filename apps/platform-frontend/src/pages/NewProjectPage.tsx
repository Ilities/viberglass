import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import {
  extractCredentialsFromIntegration,
  getErrorMessage,
  MANUAL_INTEGRATION_PLACEHOLDER,
  normalizeRepositoryUrls,
  parseCredentialsJson,
  resolveManualTicketSystem,
  type LegacyAuthCredentials,
} from '@/lib/project-form'
import { createProject, type CreateProjectRequest } from '@/service/api/project-api'
import { getIntegrations, getAllIntegrationSummaries } from '@/service/api/integration-api'
import type { IntegrationSummary, TicketSystem } from '@viberglass/types'
import { GearIcon, PlusIcon } from '@radix-ui/react-icons'
import { Link } from '@/components/link'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

// All available integrations for reference
const ALL_INTEGRATIONS = [
  { id: 'github', name: 'GitHub' },
  { id: 'gitlab', name: 'GitLab' },
  { id: 'bitbucket', name: 'Bitbucket' },
  { id: 'jira', name: 'Jira' },
  { id: 'linear', name: 'Linear' },
  { id: 'azure', name: 'Azure DevOps' },
  { id: 'asana', name: 'Asana' },
  { id: 'trello', name: 'Trello' },
  { id: 'monday', name: 'Monday.com' },
  { id: 'clickup', name: 'ClickUp' },
  { id: 'shortcut', name: 'Shortcut' },
  { id: 'slack', name: 'Slack' },
]

export function NewProjectPage() {
  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [repositoryUrls, setRepositoryUrls] = useState<string[]>([''])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showAllIntegrations, setShowAllIntegrations] = useState(false)
  const [configuredIntegrations, setConfiguredIntegrations] = useState<IntegrationSummary[]>([])
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true)
  const [integrationLoadError, setIntegrationLoadError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    let isActive = true

    async function loadIntegrations() {
      setIsLoadingIntegrations(true)
      setIntegrationLoadError(null)
      try {
        const integrations = await getAllIntegrationSummaries()
        if (!isActive) return
        setConfiguredIntegrations(
          integrations.filter((integration) => integration.configStatus === 'configured')
        )
      } catch (loadError) {
        if (!isActive) return
        setIntegrationLoadError(
          loadError instanceof Error ? loadError.message : 'Failed to load integrations'
        )
        setConfiguredIntegrations([])
      } finally {
        if (isActive) {
          setIsLoadingIntegrations(false)
        }
      }
    }

    void loadIntegrations()

    return () => {
      isActive = false
    }
  }, [])

  const hasConfiguredIntegrations = configuredIntegrations.length > 0

  const updateRepositoryUrl = (index: number, value: string) => {
    setRepositoryUrls((prev) => {
      const next = [...prev]
      next[index] = value
      return next
    })
  }

  const addRepositoryUrl = () => {
    setRepositoryUrls((prev) => [...prev, ''])
  }

  const removeRepositoryUrl = (index: number) => {
    setRepositoryUrls((prev) => {
      const next = prev.filter((_, i) => i !== index)
      return next.length > 0 ? next : ['']
    })
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const formData = new FormData(event.currentTarget)
    const repositoryUrlList = normalizeRepositoryUrls(repositoryUrls)

    try {
      // If using a preconfigured integration, fetch its credentials from the integration settings
      const manualTicketSystem = resolveManualTicketSystem(
        formData.get('ticket_system_manual')?.toString() ?? MANUAL_INTEGRATION_PLACEHOLDER
      )
      const configuredTicketSystem = (formData.get('ticket_system') as string) || 'none'
      const ticketSystem = manualTicketSystem || configuredTicketSystem
      let credentials: LegacyAuthCredentials = { type: 'api_key' }

      if (!ticketSystem || ticketSystem === 'none') {
        throw new Error('Select a ticketing integration to continue')
      }

      if (repositoryUrlList.length === 0) {
        throw new Error('Add at least one repository URL to continue')
      }

      if (ticketSystem && ticketSystem !== 'none') {
        // If provided, use manual credentials JSON from the form
        const credentialsRaw = formData.get('credentials') as string
        if (credentialsRaw) {
          try {
            credentials = parseCredentialsJson(credentialsRaw)
          } catch {
            throw new Error('Invalid JSON in Credentials field')
          }
        } else {
          // Use the new integration API to fetch the integration by system type
          const integrations = await getIntegrations(ticketSystem as TicketSystem)
          if (integrations.length > 0) {
            const integration = integrations[0]
            credentials = extractCredentialsFromIntegration(integration)
          } else {
            throw new Error(`No configured integration found for ${ticketSystem}. Please configure an integration first.`)
          }
        }
      }

      const projectData: CreateProjectRequest = {
        name: formData.get('name') as string,
        ticketSystem: ticketSystem as CreateProjectRequest['ticketSystem'],
        credentials,
        repositoryUrl: repositoryUrlList[0] ?? null,
        repositoryUrls: repositoryUrlList,
        autoFixEnabled: autoFixEnabled,
        autoFixTags: ((formData.get('auto_fix_tags') as string) || '')
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        agentInstructions: ((formData.get('agent_instructions') as string) || '').trim() || undefined,
        customFieldMappings: {},
      }

      const project = await createProject(projectData)
      navigate(`/project/${project.slug}`)
    } catch (err) {
      setError(getErrorMessage(err, 'An unexpected error occurred'))
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Create New Project</Heading>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      <form className="mt-8" onSubmit={handleSubmit}>
        <Fieldset>
          <FieldGroup className="space-y-8">
            {/* Project Name */}
            <Field>
              <Label>Project Name</Label>
              <Description>What should we call this project?</Description>
              <Input name="name" placeholder="e.g. My Awesome App" required />
            </Field>

            {/* Repository URLs */}
            <Field>
              <Label>Repository URLs</Label>
              <Description>
                Add one or more repositories for this project. The first URL is used as the default for auto-fix jobs.
              </Description>
              <div className="mt-2 space-y-3">
                {repositoryUrls.map((url, index) => (
                  <div key={`repository-${index}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      name="repository_urls"
                      type="url"
                      aria-label={`Repository URL ${index + 1}`}
                      placeholder="https://github.com/org/repo"
                      value={url}
                      onChange={(event) => updateRepositoryUrl(index, event.target.value)}
                      className="flex-1 min-w-0"
                      style={{ width: '100%' }}
                    />
                    {repositoryUrls.length > 1 ? (
                      <Button
                        type="button"
                        plain
                        className="self-start sm:self-center"
                        onClick={() => removeRepositoryUrl(index)}
                      >
                        Remove
                      </Button>
                    ) : null}
                  </div>
                ))}
                <Button type="button" plain onClick={addRepositoryUrl}>
                  Add another repository
                </Button>
              </div>
            </Field>

            {/* Integration Selection */}
            <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <Label className="text-base">Ticketing Integration</Label>
                  <Description>Select which system to use for bug tracking.</Description>
                </div>
                {hasConfiguredIntegrations && (
                  <Link
                    href="/settings/integrations"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-burnt-orange hover:underline"
                  >
                    <GearIcon className="size-4" />
                    Manage Integrations
                  </Link>
                )}
              </div>

              {integrationLoadError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                  {integrationLoadError}
                </div>
              )}

              {isLoadingIntegrations ? (
                <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                  Loading integrations...
                </div>
              ) : !hasConfiguredIntegrations ? (
                // No integrations configured - show CTA
                <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
                  <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                    <PlusIcon className="size-6 text-zinc-400" />
                  </div>
                  <h3 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
                    No integrations configured
                  </h3>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    Configure integrations first to enable bug tracking for this project.
                  </p>
                  <Button
                    href="/settings/integrations"
                    color="brand"
                    className="mt-4"
                  >
                    Configure Integrations
                  </Button>
                </div>
              ) : (
                // Show configured integrations
                <>
                  <Field>
                    <Select name="ticket_system" defaultValue="none">
                      <option value="none">Select an integration...</option>
                      {configuredIntegrations.map((integration) => (
                        <option key={integration.id} value={integration.id}>
                          {integration.label} ({integration.category === 'scm' ? 'SCM' : 'Ticketing'})
                        </option>
                      ))}
                    </Select>
                    <Description className="mt-2">
                      Only preconfigured integrations are shown.{' '}
                      <Link
                        href="/settings/integrations"
                        className="text-brand-burnt-orange hover:underline"
                      >
                        Configure more integrations
                      </Link>
                    </Description>
                  </Field>

                  {/* Advanced: Allow manual credential entry for new integrations */}
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => setShowAllIntegrations(!showAllIntegrations)}
                      className="text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                    >
                      {showAllIntegrations ? '−' : '+'} Configure new integration for this project
                    </button>

                    {showAllIntegrations && (
                      <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                        <Field>
                          <Label>Integration Type</Label>
                          <Select
                            name="ticket_system_manual"
                            defaultValue={MANUAL_INTEGRATION_PLACEHOLDER}
                          >
                            <option value={MANUAL_INTEGRATION_PLACEHOLDER}>Select a system...</option>
                            {ALL_INTEGRATIONS.map((system) => (
                              <option key={system.id} value={system.id}>
                                {system.name}
                              </option>
                            ))}
                          </Select>
                        </Field>

                        <Field>
                          <Label>Credentials (JSON)</Label>
                          <Description>
                            API keys and configuration for your ticket system.{' '}
                            <Link
                              href="/settings/integrations"
                              className="text-brand-burnt-orange hover:underline"
                            >
                              We recommend using preconfigured integrations instead.
                            </Link>
                          </Description>
                          <textarea
                            name="credentials"
                            className="font-mono block w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-brand-burnt-orange focus:outline-none focus:ring-2 focus:ring-brand-burnt-orange/20 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:focus:ring-brand-burnt-orange/30"
                            rows={5}
                            placeholder={'{\n  "token": "ghp_...",\n  "owner": "myorg",\n  "repo": "myproject"\n}'}
                          />
                        </Field>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Auto-fix Settings */}
            <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
              <SwitchField>
                <Label className="text-base">Enable Auto-fix</Label>
                <Description>
                  Allow AI to automatically suggest and create PRs for bug reports.
                </Description>
                <Switch
                  name="auto_fix_enabled"
                  checked={autoFixEnabled}
                  onChange={setAutoFixEnabled}
                />
              </SwitchField>

              {autoFixEnabled && (
                <Field className="mt-4">
                  <Label>Auto-fix Tags</Label>
                  <Description>
                    Comma-separated tags to trigger automatic fixes (e.g. &quot;bug, high-priority&quot;).
                  </Description>
                  <Input name="auto_fix_tags" placeholder="bug, fix-requested" />
                </Field>
              )}
            </div>

            {/* Agent Instructions */}
            <Field>
              <Label>Additional Agent Instructions</Label>
              <Description>
                Provide any extra guidance the AI agent should follow when working on this project.
              </Description>
              <Textarea
                name="agent_instructions"
                rows={4}
                placeholder="e.g. Prioritize safety fixes, avoid large refactors, follow internal guidelines..."
              />
            </Field>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
              <Button outline href="/">
                Cancel
              </Button>
              <Button
                type="submit"
                color="brand"
                disabled={isSubmitting || isLoadingIntegrations || !hasConfiguredIntegrations}
              >
                {isSubmitting ? 'Creating...' : 'Create Project'}
              </Button>
            </div>
          </FieldGroup>
        </Fieldset>
      </form>
    </div>
  )
}
