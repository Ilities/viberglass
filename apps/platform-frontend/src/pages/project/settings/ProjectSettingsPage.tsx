import { useParams } from 'react-router-dom'

import { Button } from '@/components/button'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Switch, SwitchField } from '@/components/switch'
import { Textarea } from '@/components/textarea'
import { useProject } from '@/context/project-context'
import { getErrorMessage, getInitialRepositoryUrls, normalizeRepositoryUrls } from '@/lib/project-form'
import {
  getAvailableIntegrationTypes,
  getIntegrationCredentials,
  getProjectIntegrations,
  type ProjectIntegrationWithDetails,
} from '@/service/api/integration-api'
import type { IntegrationCredential } from '@viberglass/types'
import {
  deleteProjectScmConfig,
  getProjectScmConfig,
  upsertProjectScmConfig,
  updateProject,
  type ProjectScmConfig,
  type UpdateProjectRequest,
} from '@/service/api/project-api'
import { getSecrets } from '@/service/api/secret-api'
import type { Secret, TicketSystem } from '@viberglass/types'
import { GearIcon, PlusIcon } from '@radix-ui/react-icons'
import { Link } from '@/components/link'
import { useEffect, useMemo, useState } from 'react'

interface LinkedIntegrationOption {
  integrationEntityId: string
  system: TicketSystem
  label: string
  category: 'scm' | 'ticketing' | 'inbound'
  isPrimary: boolean
}

const NONE_OPTION = '__none__'

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapLinkedIntegrations(
  links: ProjectIntegrationWithDetails[],
  categoryBySystem: Map<TicketSystem, 'scm' | 'ticketing' | 'inbound'>
): LinkedIntegrationOption[] {
  return links.map((link) => ({
    integrationEntityId: link.integration.id,
    system: link.integration.system,
    label: link.integration.name,
    category: categoryBySystem.get(link.integration.system) || 'ticketing',
    isPrimary: link.isPrimary,
  }))
}

export function ProjectSettingsPage() {
  const { project } = useParams<{ project: string }>()
  const { project: projectData, isLoading: isProjectLoading, error: projectError } = useProject()

  const [name, setName] = useState('')
  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [autoFixTags, setAutoFixTags] = useState('')
  const [repositoryUrls, setRepositoryUrls] = useState<string[]>([''])
  const [agentInstructions, setAgentInstructions] = useState('')

  const [linkedIntegrations, setLinkedIntegrations] = useState<LinkedIntegrationOption[]>([])
  const [ticketingIntegrationId, setTicketingIntegrationId] = useState<string>(NONE_OPTION)
  const [scmIntegrationId, setScmIntegrationId] = useState<string>(NONE_OPTION)
  const [isLoadingIntegrations, setIsLoadingIntegrations] = useState(true)
  const [integrationLoadError, setIntegrationLoadError] = useState<string | null>(null)

  const [sourceRepository, setSourceRepository] = useState('')
  const [baseBranch, setBaseBranch] = useState('main')
  const [pullRequestRepository, setPullRequestRepository] = useState('')
  const [pullRequestBaseBranch, setPullRequestBaseBranch] = useState('')
  const [branchNameTemplate, setBranchNameTemplate] = useState('')
  const [credentialSecretId, setCredentialSecretId] = useState<string>(NONE_OPTION)
  const [integrationCredentialId, setIntegrationCredentialId] = useState<string>(NONE_OPTION)
  const [initialScmConfig, setInitialScmConfig] = useState<ProjectScmConfig | null>(null)
  const [isLoadingScmConfig, setIsLoadingScmConfig] = useState(true)
  const [scmLoadError, setScmLoadError] = useState<string | null>(null)

  const [availableSecrets, setAvailableSecrets] = useState<Secret[]>([])
  const [isLoadingSecrets, setIsLoadingSecrets] = useState(true)
  const [secretsLoadError, setSecretsLoadError] = useState<string | null>(null)

  // Integration credentials for the selected SCM integration
  const [integrationCredentials, setIntegrationCredentials] = useState<IntegrationCredential[]>([])
  const [isLoadingIntegrationCredentials, setIsLoadingIntegrationCredentials] = useState(false)
  const [integrationCredentialsError, setIntegrationCredentialsError] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const ticketingIntegrations = useMemo(
    () => linkedIntegrations.filter((integration) => integration.category !== 'scm'),
    [linkedIntegrations]
  )
  const scmIntegrations = useMemo(
    () => linkedIntegrations.filter((integration) => integration.category === 'scm'),
    [linkedIntegrations]
  )

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

  useEffect(() => {
    if (!projectData) return
    setName(projectData.name ?? '')
    setAutoFixEnabled(Boolean(projectData.autoFixEnabled))
    setAutoFixTags(projectData.autoFixTags?.join(', ') ?? '')
    setAgentInstructions(projectData.agentInstructions ?? '')
    setRepositoryUrls(getInitialRepositoryUrls(projectData))
    setError(null)
    setSuccess(null)
  }, [projectData])

  useEffect(() => {
    let isActive = true

    async function loadLinkedIntegrations() {
      if (!projectData?.id) {
        setIsLoadingIntegrations(false)
        return
      }

      setIsLoadingIntegrations(true)
      setIntegrationLoadError(null)
      try {
        const [availableTypes, links] = await Promise.all([
          getAvailableIntegrationTypes(),
          getProjectIntegrations(projectData.id),
        ])
        if (!isActive) return

        const categoryBySystem = new Map(
          availableTypes.map((integrationType) => [
            integrationType.id,
            integrationType.category,
          ])
        )
        const mapped = mapLinkedIntegrations(links, categoryBySystem)
        setLinkedIntegrations(mapped)

        // Phase 2: Use primaryTicketingIntegrationId instead of deprecated ticketSystem
        const primaryTicketingId = projectData.primaryTicketingIntegrationId
        if (primaryTicketingId) {
          const primaryMatch = mapped.find(
            (integration) =>
              integration.category !== 'scm' && integration.integrationEntityId === primaryTicketingId
          )
          setTicketingIntegrationId(primaryMatch?.integrationEntityId ?? NONE_OPTION)
        } else {
          // Fallback to deprecated ticketSystem field for backward compatibility
          const ticketingMatch = mapped.find(
            (integration) =>
              integration.category !== 'scm' && integration.system === projectData.ticketSystem
          )
          setTicketingIntegrationId(ticketingMatch?.integrationEntityId ?? NONE_OPTION)
        }

        if (initialScmConfig?.integrationId) {
          const scmMatch = mapped.find(
            (integration) =>
              integration.category === 'scm' &&
              integration.integrationEntityId === initialScmConfig.integrationId
          )
          setScmIntegrationId(scmMatch?.integrationEntityId ?? NONE_OPTION)
        }
      } catch (loadError) {
        if (!isActive) return
        setLinkedIntegrations([])
        setTicketingIntegrationId(NONE_OPTION)
        setIntegrationLoadError(
          loadError instanceof Error ? loadError.message : 'Failed to load linked integrations'
        )
      } finally {
        if (isActive) {
          setIsLoadingIntegrations(false)
        }
      }
    }

    void loadLinkedIntegrations()

    return () => {
      isActive = false
    }
  }, [projectData?.id, projectData?.ticketSystem, initialScmConfig?.integrationId])

  useEffect(() => {
    let isActive = true

    async function loadScmConfigAndSecrets() {
      if (!projectData?.id) {
        setIsLoadingScmConfig(false)
        setIsLoadingSecrets(false)
        return
      }

      setIsLoadingScmConfig(true)
      setScmLoadError(null)
      setIsLoadingSecrets(true)
      setSecretsLoadError(null)

      const [scmResult, secretsResult] = await Promise.allSettled([
        getProjectScmConfig(projectData.id),
        getSecrets(200, 0),
      ])

      if (!isActive) return

      if (scmResult.status === 'fulfilled') {
        const scmConfig = scmResult.value
        setInitialScmConfig(scmConfig)
        if (scmConfig) {
          setScmIntegrationId(scmConfig.integrationId)
          setSourceRepository(scmConfig.sourceRepository)
          setBaseBranch(scmConfig.baseBranch || 'main')
          setPullRequestRepository(scmConfig.pullRequestRepository ?? '')
          setPullRequestBaseBranch(scmConfig.pullRequestBaseBranch ?? '')
          setBranchNameTemplate(scmConfig.branchNameTemplate ?? '')
          setCredentialSecretId(scmConfig.credentialSecretId ?? NONE_OPTION)
          setIntegrationCredentialId(scmConfig.integrationCredentialId ?? NONE_OPTION)
        } else {
          setScmIntegrationId(NONE_OPTION)
          setSourceRepository('')
          setBaseBranch('main')
          setPullRequestRepository('')
          setPullRequestBaseBranch('')
          setBranchNameTemplate('')
          setCredentialSecretId(NONE_OPTION)
          setIntegrationCredentialId(NONE_OPTION)
        }
      } else {
        setScmLoadError(
          scmResult.reason instanceof Error
            ? scmResult.reason.message
            : 'Failed to load SCM configuration'
        )
      }
      setIsLoadingScmConfig(false)

      if (secretsResult.status === 'fulfilled') {
        setAvailableSecrets(secretsResult.value)
      } else {
        setSecretsLoadError(
          secretsResult.reason instanceof Error
            ? secretsResult.reason.message
            : 'Failed to load secrets'
        )
        setAvailableSecrets([])
      }
      setIsLoadingSecrets(false)
    }

    void loadScmConfigAndSecrets()

    return () => {
      isActive = false
    }
  }, [projectData?.id])

  // Load integration credentials when SCM integration changes
  useEffect(() => {
    let isActive = true

    async function loadIntegrationCredentials() {
      if (scmIntegrationId === NONE_OPTION || !scmIntegrationId) {
        setIntegrationCredentials([])
        setIsLoadingIntegrationCredentials(false)
        return
      }

      setIsLoadingIntegrationCredentials(true)
      setIntegrationCredentialsError(null)

      try {
        const credentials = await getIntegrationCredentials(scmIntegrationId)
        if (isActive) {
          setIntegrationCredentials(credentials)
        }
      } catch (error) {
        console.error('Failed to load integration credentials:', error)
        if (isActive) {
          setIntegrationCredentials([])
          setIntegrationCredentialsError(
            error instanceof Error ? error.message : 'Failed to load integration credentials'
          )
        }
      } finally {
        if (isActive) {
          setIsLoadingIntegrationCredentials(false)
        }
      }
    }

    void loadIntegrationCredentials()

    return () => {
      isActive = false
    }
  }, [scmIntegrationId])

  const resetForm = () => {
    if (!projectData) return
    setName(projectData.name ?? '')
    setAutoFixEnabled(Boolean(projectData.autoFixEnabled))
    setAutoFixTags(projectData.autoFixTags?.join(', ') ?? '')
    setAgentInstructions(projectData.agentInstructions ?? '')
    setRepositoryUrls(getInitialRepositoryUrls(projectData))

    // Phase 2: Use primaryTicketingIntegrationId instead of deprecated ticketSystem
    const primaryTicketingId = projectData.primaryTicketingIntegrationId
    if (primaryTicketingId) {
      const primaryMatch = ticketingIntegrations.find(
        (integration) => integration.integrationEntityId === primaryTicketingId
      )
      setTicketingIntegrationId(primaryMatch?.integrationEntityId ?? NONE_OPTION)
    } else {
      // Fallback to deprecated ticketSystem field for backward compatibility
      const ticketingMatch = ticketingIntegrations.find(
        (integration) => integration.system === projectData.ticketSystem
      )
      setTicketingIntegrationId(ticketingMatch?.integrationEntityId ?? NONE_OPTION)
    }

    if (initialScmConfig) {
      setScmIntegrationId(initialScmConfig.integrationId)
      setSourceRepository(initialScmConfig.sourceRepository)
      setBaseBranch(initialScmConfig.baseBranch || 'main')
      setPullRequestRepository(initialScmConfig.pullRequestRepository ?? '')
      setPullRequestBaseBranch(initialScmConfig.pullRequestBaseBranch ?? '')
      setBranchNameTemplate(initialScmConfig.branchNameTemplate ?? '')
      setCredentialSecretId(initialScmConfig.credentialSecretId ?? NONE_OPTION)
      setIntegrationCredentialId(initialScmConfig.integrationCredentialId ?? NONE_OPTION)
    } else {
      setScmIntegrationId(NONE_OPTION)
      setSourceRepository('')
      setBaseBranch('main')
      setPullRequestRepository('')
      setPullRequestBaseBranch('')
      setBranchNameTemplate('')
      setCredentialSecretId(NONE_OPTION)
      setIntegrationCredentialId(NONE_OPTION)
    }

    setError(null)
    setSuccess(null)
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!projectData) return

    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      if (!name.trim()) {
        throw new Error('Project name is required')
      }

      const selectedTicketingIntegration = ticketingIntegrations.find(
        (integration) => integration.integrationEntityId === ticketingIntegrationId
      )
      if (!selectedTicketingIntegration) {
        throw new Error('Select a ticketing integration linked to this project')
      }

      const repositoryUrlList = normalizeRepositoryUrls(repositoryUrls)
      if (repositoryUrlList.length === 0) {
        throw new Error('Add at least one repository URL to continue')
      }

      const updates: UpdateProjectRequest = {
        name: name.trim(),
        ticketSystem: selectedTicketingIntegration.system,
        autoFixEnabled,
        autoFixTags: autoFixTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
        repositoryUrl: repositoryUrlList[0] ?? null,
        repositoryUrls: repositoryUrlList,
        agentInstructions: normalizeOptionalText(agentInstructions),
      }

      const updatedProject = await updateProject(projectData.id, updates)

      if (scmIntegrationId !== NONE_OPTION) {
        const selectedScmIntegration = scmIntegrations.find(
          (integration) => integration.integrationEntityId === scmIntegrationId
        )
        if (!selectedScmIntegration) {
          throw new Error('Select a valid SCM integration linked to this project')
        }

        const normalizedSourceRepository = sourceRepository.trim()
        if (!normalizedSourceRepository) {
          throw new Error('Source repository is required when SCM integration is selected')
        }

        const scmConfig = await upsertProjectScmConfig(projectData.id, {
          integrationId: selectedScmIntegration.integrationEntityId,
          sourceRepository: normalizedSourceRepository,
          baseBranch: normalizeOptionalText(baseBranch) || 'main',
          pullRequestRepository: normalizeOptionalText(pullRequestRepository),
          pullRequestBaseBranch: normalizeOptionalText(pullRequestBaseBranch),
          branchNameTemplate: normalizeOptionalText(branchNameTemplate),
          credentialSecretId:
            credentialSecretId !== NONE_OPTION ? credentialSecretId : null,
          integrationCredentialId:
            integrationCredentialId !== NONE_OPTION ? integrationCredentialId : null,
        })
        setInitialScmConfig(scmConfig)
      } else if (initialScmConfig) {
        await deleteProjectScmConfig(projectData.id)
        setInitialScmConfig(null)
      }

      setSuccess('Project settings saved.')
      setName(updatedProject.name ?? '')
      setAutoFixEnabled(Boolean(updatedProject.autoFixEnabled))
      setAutoFixTags(updatedProject.autoFixTags?.join(', ') ?? '')
      setAgentInstructions(updatedProject.agentInstructions ?? '')
      setRepositoryUrls(getInitialRepositoryUrls(updatedProject))
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Failed to update project'))
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

  return (
    <div className="mx-auto max-w-4xl">
      <Heading>Project Settings</Heading>

      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
        Configure core project settings, ticketing integration, and SCM execution.
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
                  Legacy fallback repository list. The first URL is used when no SCM configuration is set.
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

              <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <Label className="text-base">Ticketing Integration</Label>
                    <Description>Select which linked integration to use for bug tracking.</Description>
                  </div>
                  <Link
                    href={`/project/${project}/settings/integrations`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-burnt-orange hover:underline"
                  >
                    <GearIcon className="size-4" />
                    Manage Links
                  </Link>
                </div>

                {integrationLoadError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                    {integrationLoadError}
                  </div>
                )}

                {isLoadingIntegrations ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                    Loading linked integrations...
                  </div>
                ) : ticketingIntegrations.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-6 text-center dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <PlusIcon className="size-6 text-zinc-400" />
                    </div>
                    <h3 className="mt-4 text-sm font-semibold text-zinc-950 dark:text-white">
                      No ticketing integrations linked
                    </h3>
                    <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                      Link at least one ticketing integration to this project to continue.
                    </p>
                    <Button href={`/project/${project}/settings/integrations`} color="brand" className="mt-4">
                      Link Integrations
                    </Button>
                  </div>
                ) : (
                  <Field>
                    <Select
                      name="ticket_integration"
                      value={ticketingIntegrationId}
                      onChange={(value) => setTicketingIntegrationId(value)}
                    >
                      <option value={NONE_OPTION}>Select a linked ticketing integration...</option>
                      {ticketingIntegrations.map((integration) => (
                        <option key={integration.integrationEntityId} value={integration.integrationEntityId}>
                          {integration.label} ({integration.system})
                        </option>
                      ))}
                    </Select>
                  </Field>
                )}
              </div>

              <div className="rounded-xl border border-zinc-950/10 bg-zinc-50/50 p-6 dark:border-white/10 dark:bg-zinc-900/50">
                <div className="mb-4 flex items-center justify-between">
                  <div>
                    <Label className="text-base">SCM Execution</Label>
                    <Description>
                      Configure repository, branch strategy, and credential secret used by clankers.
                    </Description>
                  </div>
                  <Link
                    href={`/project/${project}/settings/integrations`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-burnt-orange hover:underline"
                  >
                    <GearIcon className="size-4" />
                    Manage Links
                  </Link>
                </div>

                {scmLoadError && (
                  <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                    {scmLoadError}
                  </div>
                )}

                <FieldGroup className="space-y-4">
                  <Field>
                    <Label>SCM Integration</Label>
                    {isLoadingIntegrations || isLoadingScmConfig ? (
                      <Description>Loading SCM integration options...</Description>
                    ) : null}
                    <Select
                      name="scm_integration"
                      value={scmIntegrationId}
                      onChange={(value) => setScmIntegrationId(value)}
                      disabled={isLoadingIntegrations || isLoadingScmConfig || scmIntegrations.length === 0}
                    >
                      <option value={NONE_OPTION}>No SCM integration configured</option>
                      {scmIntegrations.map((integration) => (
                        <option key={integration.integrationEntityId} value={integration.integrationEntityId}>
                          {integration.label} ({integration.system})
                        </option>
                      ))}
                    </Select>
                    {scmIntegrations.length === 0 ? (
                      <Description className="mt-2">
                        Link a GitHub/GitLab/Bitbucket integration in{' '}
                        <Link href={`/project/${project}/settings/integrations`} className="text-brand-burnt-orange hover:underline">
                          project integrations
                        </Link>{' '}
                        to enable SCM configuration.
                      </Description>
                    ) : null}
                  </Field>

                  <Field>
                    <Label>Source Repository</Label>
                    <Description>Repository cloned by clankers when executing jobs.</Description>
                    <Input
                      name="source_repository"
                      placeholder="https://github.com/org/repo"
                      value={sourceRepository}
                      onChange={(event) => setSourceRepository(event.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Base Branch</Label>
                    <Description>Default branch used as merge target and checkout base.</Description>
                    <Input
                      name="base_branch"
                      placeholder="main"
                      value={baseBranch}
                      onChange={(event) => setBaseBranch(event.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Pull Request Repository (Optional)</Label>
                    <Description>Override PR destination repository. Leave empty to use source repository.</Description>
                    <Input
                      name="pr_repository"
                      placeholder="https://github.com/org/repo"
                      value={pullRequestRepository}
                      onChange={(event) => setPullRequestRepository(event.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Pull Request Base Branch (Optional)</Label>
                    <Description>Override PR base branch. Leave empty to use base branch.</Description>
                    <Input
                      name="pr_base_branch"
                      placeholder="main"
                      value={pullRequestBaseBranch}
                      onChange={(event) => setPullRequestBaseBranch(event.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Branch Name Template (Optional)</Label>
                    <Description>Template used by workers when creating fix branches.</Description>
                    <Input
                      name="branch_name_template"
                      placeholder="viberator/{{ticketId}}-{{timestamp}}"
                      value={branchNameTemplate}
                      onChange={(event) => setBranchNameTemplate(event.target.value)}
                      disabled={scmIntegrationId === NONE_OPTION}
                    />
                  </Field>

                  <Field>
                    <Label>Integration Credential (Recommended)</Label>
                    <Description>
                      Select an integration credential for SCM authentication. These are managed in the{' '}
                      <Link
                        href={`/settings/integrations/${scmIntegrationId}`}
                        className="text-brand-burnt-orange hover:underline"
                      >
                        integration settings
                      </Link>
                      .
                    </Description>
                    <Select
                      name="integration_credential_id"
                      value={integrationCredentialId}
                      onChange={(value) => setIntegrationCredentialId(value)}
                      disabled={scmIntegrationId === NONE_OPTION || isLoadingIntegrationCredentials}
                    >
                      <option value={NONE_OPTION}>
                        {isLoadingIntegrationCredentials ? 'Loading credentials...' : 'Select an integration credential'}
                      </option>
                      {integrationCredentials.map((credential) => (
                        <option key={credential.id} value={credential.id}>
                          {credential.name}
                          {credential.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </Select>
                    {integrationCredentialsError ? (
                      <Description className="mt-2 text-red-600 dark:text-red-400">
                        {integrationCredentialsError}
                      </Description>
                    ) : null}
                    {!isLoadingIntegrationCredentials && integrationCredentials.length === 0 && scmIntegrationId !== NONE_OPTION ? (
                      <Description className="mt-2">
                        No integration credentials configured. Create one in{' '}
                        <Link
                          href={`/settings/integrations/${scmIntegrationId}`}
                          className="text-brand-burnt-orange hover:underline"
                        >
                          integration settings
                        </Link>
                        .
                      </Description>
                    ) : null}
                  </Field>

                  <Field>
                    <Label>Legacy Credential Secret (Optional)</Label>
                    <Description>
                      Deprecated: Use Integration Credential above. This legacy option adds a raw secret to runtime credentials.
                    </Description>
                    <Select
                      name="credential_secret_id"
                      value={credentialSecretId}
                      onChange={(value) => setCredentialSecretId(value)}
                      disabled={scmIntegrationId === NONE_OPTION || isLoadingSecrets}
                    >
                      <option value={NONE_OPTION}>No legacy credential secret</option>
                      {availableSecrets.map((secret) => (
                        <option key={secret.id} value={secret.id}>
                          {secret.name}
                        </option>
                      ))}
                    </Select>
                    {secretsLoadError ? (
                      <Description className="mt-2 text-red-600 dark:text-red-400">
                        {secretsLoadError}
                      </Description>
                    ) : null}
                  </Field>
                </FieldGroup>
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
