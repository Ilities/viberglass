import { useParams } from 'react-router-dom'

import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { useProject } from '@/context/project-context'
import { getIntegrationConfig, getProjectIntegrationSummaries } from '@/service/api/integration-api'
import { updateProject, type UpdateProjectRequest } from '@/service/api/project-api'
import type { AuthCredentials, IntegrationSummary, TicketSystem } from '@viberglass/types'
import { GearIcon, PlusIcon } from '@radix-ui/react-icons'
import { Link } from '@/components/link'
import { useEffect, useState } from 'react'

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
] as const

interface ProjectSettingsClientProps {
  project: string
}

export function ProjectSettingsPage() {
  const { project } = useParams<{ project: string }>()
  const { project: projectData, isLoading: isProjectLoading, error: projectError } = useProject()
  const [name, setName] = useState('')
  const [ticketSystem, setTicketSystem] = useState<string>('none')
  const [manualTicketSystem, setManualTicketSystem] = useState('')
  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [autoFixTags, setAutoFixTags] = useState('')
  const [repositoryUrls, setRepositoryUrls] = useState<string[]>([''])
  const [agentInstructions, setAgentInstructions] = useState('')
  const [credentialsJson, setCredentialsJson] = useState('')
  const [showAllIntegrations, setShowAllIntegrations] = useState(false)
  const [configuredIntegrations, setConfiguredIntegrations] = useState<IntegrationSummary[]>([])
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true)
  const [integrationLoadError, setIntegrationLoadError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true

    async function loadIntegrations() {
      if (!projectData?.id) {
        setIsLoadingIntegrations(false)
        return
      }

      setIsLoadingIntegrations(true)
      setIntegrationLoadError(null)
      try {
        const integrations = await getProjectIntegrationSummaries(projectData.id)
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
  }, [projectData?.id])

  useEffect(() => {
    if (!projectData) return
    setName(projectData.name ?? '')
    setTicketSystem(projectData.ticketSystem ?? 'none')
    setManualTicketSystem('')
    setAutoFixEnabled(Boolean(projectData.autoFixEnabled))
    setAutoFixTags(projectData.autoFixTags?.join(', ') ?? '')
    setAgentInstructions(projectData.agentInstructions ?? '')
    const existingUrls =
      projectData.repositoryUrls && projectData.repositoryUrls.length > 0
        ? projectData.repositoryUrls
        : projectData.repositoryUrl
          ? [projectData.repositoryUrl]
          : ['']
    setRepositoryUrls(existingUrls.length > 0 ? existingUrls : [''])
    setCredentialsJson('')
  }, [projectData])

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

  const toggleManualIntegrations = () => {
    setShowAllIntegrations((prev) => {
      const next = !prev
      if (!next) {
        setManualTicketSystem('')
        setCredentialsJson('')
      }
      return next
    })
  }

  const getIntegrationLabel = (id: string) => {
    const configured = configuredIntegrations.find((integration) => integration.id === id)
    if (configured) return configured.label
    const all = ALL_INTEGRATIONS.find((integration) => integration.id === id)
    return all?.name ?? id
  }

  const resetForm = () => {
    if (!projectData) return
    setName(projectData.name ?? '')
    setTicketSystem(projectData.ticketSystem ?? 'none')
    setManualTicketSystem('')
    setAutoFixEnabled(Boolean(projectData.autoFixEnabled))
    setAutoFixTags(projectData.autoFixTags?.join(', ') ?? '')
    setAgentInstructions(projectData.agentInstructions ?? '')
    const existingUrls =
      projectData.repositoryUrls && projectData.repositoryUrls.length > 0
        ? projectData.repositoryUrls
        : projectData.repositoryUrl
          ? [projectData.repositoryUrl]
          : ['']
    setRepositoryUrls(existingUrls.length > 0 ? existingUrls : [''])
    setCredentialsJson('')
    setShowAllIntegrations(false)
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectData) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    const repositoryUrlList = repositoryUrls.map((url) => url.trim()).filter(Boolean)
    const selectedTicketSystem = manualTicketSystem || ticketSystem

    try {
      if (!name.trim()) {
        throw new Error('Project name is required')
      }

      if (!selectedTicketSystem || selectedTicketSystem === 'none') {
        throw new Error('Select a ticketing integration to continue')
      }

      if (repositoryUrlList.length === 0) {
        throw new Error('Add at least one repository URL to continue')
      }

      let credentialsUpdate: AuthCredentials | undefined
      const credentialsRaw = credentialsJson.trim()

      if (credentialsRaw) {
        try {
          const parsed = JSON.parse(credentialsRaw)
          credentialsUpdate = {
            type: parsed.type || 'api_key',
            ...parsed,
          }
        } catch (parseError) {
          throw new Error('Invalid JSON in Credentials field')
        }
      } else if (selectedTicketSystem !== projectData.ticketSystem) {
        const integrationConfig = await getIntegrationConfig(
          undefined,
          selectedTicketSystem as TicketSystem
        )

        if (!integrationConfig) {
          throw new Error(
            'No credentials found for the selected integration. Provide credentials manually.'
          )
        }

        const credentialKeys = [
          'apiKey',
          'username',
          'password',
          'token',
          'clientId',
          'clientSecret',
          'refreshToken',
          'baseUrl',
        ] as const
        const extracted: AuthCredentials = { type: integrationConfig.authType }
        credentialKeys.forEach((key) => {
          if (integrationConfig.values[key] !== undefined) {
            extracted[key] = integrationConfig.values[key] as AuthCredentials[typeof key]
          }
        })
        credentialsUpdate = extracted
      }

      const updates: UpdateProjectRequest = {
        name: name.trim(),
        ticketSystem: selectedTicketSystem as TicketSystem,
        autoFixEnabled,
        autoFixTags: autoFixTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        repositoryUrl: repositoryUrlList[0] ?? null,
        repositoryUrls: repositoryUrlList,
        agentInstructions: agentInstructions.trim() || null,
      }

      if (credentialsUpdate) {
        updates.credentials = credentialsUpdate
      }

      const updatedProject = await updateProject(projectData.id, updates)
      setSuccess('Project settings saved.')
      setTicketSystem(updatedProject.ticketSystem)
      setAutoFixEnabled(Boolean(updatedProject.autoFixEnabled))
      setAutoFixTags(updatedProject.autoFixTags?.join(', ') ?? '')
      setAgentInstructions(updatedProject.agentInstructions ?? '')
      setRepositoryUrls(
        updatedProject.repositoryUrls && updatedProject.repositoryUrls.length > 0
          ? updatedProject.repositoryUrls
          : updatedProject.repositoryUrl
            ? [updatedProject.repositoryUrl]
            : ['']
      )
      setManualTicketSystem('')
      setCredentialsJson('')
      setShowAllIntegrations(false)
    } catch (submitError: any) {
      setError(submitError.message || 'Failed to update project')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isProjectLoading && !projectData) {
    return (
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <Heading>Project Settings</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Loading project settings...
        </p>
      </div>
    )
  }

  const currentTicketSystemMissing =
    ticketSystem !== 'none' &&
    ticketSystem !== '' &&
    !configuredIntegrations.some((integration) => integration.id === ticketSystem)

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Project Settings</Heading>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Configure the core project details and auto-fix behavior.
      </p>

      {projectError && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {projectError}
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-4 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 rounded-md bg-green-50 p-4 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-300">
          {success}
        </div>
      )}

      {!projectData ? (
        <div className="mt-6 rounded-md border border-zinc-200 p-6 text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
          Unable to load project details for {project}.
        </div>
      ) : (
        <form className="mt-8" onSubmit={handleSubmit}>
          <Fieldset disabled={isSubmitting}>
            <FieldGroup className="space-y-8">
              <Field>
                <Label>Project Name</Label>
                <Description>Update the project name shown across the platform.</Description>
                <Input
                  name="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </Field>

              <Field>
                <Label>Repository URLs</Label>
                <Description>
                  Add one or more repositories for this project. The first URL is used as the default for auto-fix
                  jobs.
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
                    <Button href="/settings/integrations" color="brand" className="mt-4">
                      Configure Integrations
                    </Button>
                  </div>
                ) : (
                  <>
                    <Field>
                      <Select
                        name="ticket_system"
                        value={ticketSystem}
                        onChange={(event) => setTicketSystem(event.target.value)}
                      >
                        <option value="none">Select an integration...</option>
                        {configuredIntegrations.map((integration) => (
                          <option key={integration.id} value={integration.id}>
                            {integration.label} ({integration.category === 'scm' ? 'SCM' : 'Ticketing'})
                          </option>
                        ))}
                        {currentTicketSystemMissing ? (
                          <option value={ticketSystem}>{getIntegrationLabel(ticketSystem)}</option>
                        ) : null}
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

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={toggleManualIntegrations}
                        className="text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-white"
                      >
                        {showAllIntegrations ? '-' : '+'} Configure new integration for this project
                      </button>

                      {showAllIntegrations && (
                        <div className="mt-4 space-y-4 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900">
                          <Field>
                            <Label>Integration Type</Label>
                            <Select
                              name="ticket_system_manual"
                              value={manualTicketSystem}
                              onChange={(event) => setManualTicketSystem(event.target.value)}
                            >
                              <option value="">Select a system...</option>
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
                              placeholder={
                                '{\n  "token": "ghp_...",\n  "owner": "myorg",\n  "repo": "myproject"\n}'
                              }
                              value={credentialsJson}
                              onChange={(event) => setCredentialsJson(event.target.value)}
                            />
                          </Field>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
                <SwitchField>
                  <Label className="text-base">Enable Auto-fix</Label>
                  <Description>
                    Allow AI to automatically suggest and create PRs for bug reports.
                  </Description>
                  <Switch checked={autoFixEnabled} onChange={setAutoFixEnabled} />
                </SwitchField>

                {autoFixEnabled && (
                  <Field className="mt-4">
                    <Label>Auto-fix Tags</Label>
                    <Description>
                      Comma-separated tags to trigger automatic fixes (e.g. &quot;bug, high-priority&quot;).
                    </Description>
                    <Input
                      name="auto_fix_tags"
                      value={autoFixTags}
                      onChange={(event) => setAutoFixTags(event.target.value)}
                      placeholder="bug, fix-requested"
                    />
                  </Field>
                )}
              </div>

              <Field>
                <Label>Additional Agent Instructions</Label>
                <Description>
                  Provide any extra guidance the AI agent should follow when working on this project.
                </Description>
                <Textarea
                  name="agent_instructions"
                  rows={4}
                  value={agentInstructions}
                  onChange={(event) => setAgentInstructions(event.target.value)}
                  placeholder="e.g. Prioritize safety fixes, avoid large refactors, follow internal guidelines..."
                />
              </Field>

              <div className="flex justify-end gap-4 border-t border-zinc-950/10 pt-8 dark:border-white/10">
                <Button type="button" outline onClick={resetForm}>
                  Reset
                </Button>
                <Button type="submit" color="brand" disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </FieldGroup>
          </Fieldset>
        </form>
      )}
    </div>
  )
}
