import { useAuth } from '@/context/auth-context'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, FieldGroup, Fieldset, Label } from '@/components/fieldset'
import { Heading } from '@/components/heading'
import { Input } from '@/components/input'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { useProject } from '@/context/project-context'
import { getErrorMessage } from '@/lib/project-form'
import {
  getAvailableIntegrationTypes,
  getIntegrationCredentials,
  getProjectIntegrations,
  type ProjectIntegrationWithDetails,
} from '@/service/api/integration-api'
import {
  archiveProject,
  deleteProject,
  deleteProjectScmConfig,
  getProjectDeletionSummary,
  getProjectScmConfig,
  updateProject,
  upsertProjectScmConfig,
  type ProjectDeletionSummary,
  type ProjectScmConfig,
  type UpdateProjectRequest,
} from '@/service/api/project-api'
import { GearIcon } from '@radix-ui/react-icons'
import type { IntegrationCredential, TicketSystem } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { SpaceAdvancedSettings } from './SpaceAdvancedSettings'

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
    category: categoryBySystem.get(link.integration.system) || 'inbound',
    isPrimary: link.isPrimary,
  }))
}

export function ProjectSettingsPage() {
  const { project } = useParams<{ project: string }>()
  const { project: projectData, isLoading: isProjectLoading, error: projectError } = useProject()
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [autoFixEnabled, setAutoFixEnabled] = useState(false)
  const [autoFixTags, setAutoFixTags] = useState('')

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
  const [integrationCredentialId, setIntegrationCredentialId] = useState<string>(NONE_OPTION)
  const [initialScmConfig, setInitialScmConfig] = useState<ProjectScmConfig | null>(null)
  const [isLoadingScmConfig, setIsLoadingScmConfig] = useState(true)
  const [scmLoadError, setScmLoadError] = useState<string | null>(null)

  // Integration credentials for the selected SCM integration
  const [integrationCredentials, setIntegrationCredentials] = useState<IntegrationCredential[]>([])
  const [isLoadingIntegrationCredentials, setIsLoadingIntegrationCredentials] = useState(false)
  const [integrationCredentialsError, setIntegrationCredentialsError] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deletionSummary, setDeletionSummary] = useState<ProjectDeletionSummary | null>(null)
  const [isArchiving, setIsArchiving] = useState(false)
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'

  const ticketingIntegrations = useMemo(
    () => linkedIntegrations.filter((integration) => integration.category === 'ticketing'),
    [linkedIntegrations]
  )
  const scmIntegrations = useMemo(
    () => linkedIntegrations.filter((integration) => integration.category === 'scm'),
    [linkedIntegrations]
  )

  useEffect(() => {
    if (!projectData) return
    setName(projectData.name ?? '')
    setAutoFixEnabled(Boolean(projectData.autoFixEnabled))
    setAutoFixTags(projectData.autoFixTags?.join(', ') ?? '')

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
          availableTypes.map((integrationType) => [integrationType.id, integrationType.category])
        )
        const mapped = mapLinkedIntegrations(links, categoryBySystem)
        setLinkedIntegrations(mapped)

        // Use primaryTicketingIntegrationId instead of deprecated ticketSystem
        const primaryTicketingId = projectData.primaryTicketingIntegrationId
        if (primaryTicketingId) {
          const primaryMatch = mapped.find(
            (integration) =>
              integration.category === 'ticketing' && integration.integrationEntityId === primaryTicketingId
          )
          setTicketingIntegrationId(primaryMatch?.integrationEntityId ?? NONE_OPTION)
        } else {
          // Fallback to deprecated ticketSystem field for backward compatibility
          const ticketingMatch = mapped.find(
            (integration) => integration.category === 'ticketing' && integration.system === projectData.ticketSystem
          )
          setTicketingIntegrationId(ticketingMatch?.integrationEntityId ?? NONE_OPTION)
        }

        if (initialScmConfig?.integrationId) {
          const scmMatch = mapped.find(
            (integration) =>
              integration.category === 'scm' && integration.integrationEntityId === initialScmConfig.integrationId
          )
          setScmIntegrationId(scmMatch?.integrationEntityId ?? NONE_OPTION)
        } else {
          const primaryScmId = projectData.primaryScmIntegrationId
          if (primaryScmId) {
            const scmMatch = mapped.find(
              (integration) => integration.category === 'scm' && integration.integrationEntityId === primaryScmId
            )
            setScmIntegrationId(scmMatch?.integrationEntityId ?? NONE_OPTION)
          }
        }
      } catch (loadError) {
        if (!isActive) return
        setLinkedIntegrations([])
        setTicketingIntegrationId(NONE_OPTION)
        setIntegrationLoadError(loadError instanceof Error ? loadError.message : 'Failed to load linked integrations')
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
  }, [
    projectData?.id,
    projectData?.ticketSystem,
    projectData?.primaryScmIntegrationId,
    projectData?.primaryTicketingIntegrationId,
    initialScmConfig?.integrationId,
  ])

  useEffect(() => {
    if (initialScmConfig?.integrationId) return
    if (!projectData?.primaryScmIntegrationId) return
    if (scmIntegrationId !== NONE_OPTION && scmIntegrationId !== '') return

    const primaryScmMatch = scmIntegrations.find(
      (integration) => integration.integrationEntityId === projectData.primaryScmIntegrationId
    )
    if (primaryScmMatch) {
      setScmIntegrationId(primaryScmMatch.integrationEntityId)
    }
  }, [initialScmConfig?.integrationId, projectData?.primaryScmIntegrationId, scmIntegrationId, scmIntegrations])

  useEffect(() => {
    let isActive = true

    async function loadScmConfig() {
      if (!projectData?.id) {
        setIsLoadingScmConfig(false)
        return
      }

      setIsLoadingScmConfig(true)
      setScmLoadError(null)

      try {
        const scmConfig = await getProjectScmConfig(projectData.id)
        if (!isActive) return
        setInitialScmConfig(scmConfig)
        if (scmConfig) {
          setScmIntegrationId(scmConfig.integrationId)
          setSourceRepository(scmConfig.sourceRepository)
          setBaseBranch(scmConfig.baseBranch || 'main')
          setPullRequestRepository(scmConfig.pullRequestRepository ?? '')
          setPullRequestBaseBranch(scmConfig.pullRequestBaseBranch ?? '')
          setBranchNameTemplate(scmConfig.branchNameTemplate ?? '')
          // Resolve selected credential after options load to avoid invalid select state resets.
          setIntegrationCredentialId(NONE_OPTION)
        } else {
          setScmIntegrationId(projectData.primaryScmIntegrationId ?? NONE_OPTION)
          setSourceRepository('')
          setBaseBranch('main')
          setPullRequestRepository('')
          setPullRequestBaseBranch('')
          setBranchNameTemplate('')
          setIntegrationCredentialId(NONE_OPTION)
        }
      } catch (error) {
        if (!isActive) return
        setScmLoadError(error instanceof Error ? error.message : 'Failed to load SCM configuration')
      } finally {
        if (isActive) {
          setIsLoadingScmConfig(false)
        }
      }
    }

    void loadScmConfig()

    return () => {
      isActive = false
    }
  }, [projectData?.id, projectData?.primaryScmIntegrationId])

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
          setIntegrationCredentialId((currentCredentialId) => {
            if (
              currentCredentialId !== NONE_OPTION &&
              credentials.some((credential) => credential.id === currentCredentialId)
            ) {
              return currentCredentialId
            }

            const persistedCredentialId =
              initialScmConfig?.integrationId === scmIntegrationId ? initialScmConfig.integrationCredentialId : null

            if (persistedCredentialId && credentials.some((credential) => credential.id === persistedCredentialId)) {
              return persistedCredentialId
            }

            return NONE_OPTION
          })
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
  }, [initialScmConfig?.integrationCredentialId, initialScmConfig?.integrationId, scmIntegrationId])

  async function handleDeleteProject() {
    if (!projectData) return
    setIsDeleting(true)
    setDeleteError(null)
    try {
      await deleteProject(projectData.id)
      navigate('/')
    } catch (err) {
      setDeleteError(getErrorMessage(err, 'Failed to delete space'))
      setIsDeleting(false)
    }
  }

  async function handleArchiveProject() {
    if (!projectData) return
    setIsArchiving(true)
    try {
      await archiveProject(projectData.id)
      navigate('/')
    } catch (archiveError) {
      const message = getErrorMessage(archiveError, 'Failed to archive space')
      // Shown in the delete dialog when archiving from there, otherwise at the top.
      setError(message)
      setDeleteError(message)
      setIsArchiving(false)
    }
  }

  const resetForm = () => {
    if (!projectData) return
    setName(projectData.name ?? '')
    setAutoFixEnabled(Boolean(projectData.autoFixEnabled))
    setAutoFixTags(projectData.autoFixTags?.join(', ') ?? '')

    // Use primaryTicketingIntegrationId instead of deprecated ticketSystem
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
      setIntegrationCredentialId(initialScmConfig.integrationCredentialId ?? NONE_OPTION)
    } else if (projectData.primaryScmIntegrationId) {
      const primaryScmMatch = scmIntegrations.find(
        (integration) => integration.integrationEntityId === projectData.primaryScmIntegrationId
      )
      setScmIntegrationId(primaryScmMatch?.integrationEntityId ?? NONE_OPTION)
      setSourceRepository('')
      setBaseBranch('main')
      setPullRequestRepository('')
      setPullRequestBaseBranch('')
      setBranchNameTemplate('')
      setIntegrationCredentialId(NONE_OPTION)
    } else {
      setScmIntegrationId(NONE_OPTION)
      setSourceRepository('')
      setBaseBranch('main')
      setPullRequestRepository('')
      setPullRequestBaseBranch('')
      setBranchNameTemplate('')
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
        throw new Error('Give the space a name.')
      }

      const selectedTicketingIntegration = ticketingIntegrations.find(
        (integration) => integration.integrationEntityId === ticketingIntegrationId
      )

      const updates: UpdateProjectRequest = {
        name: name.trim(),
        primaryTicketingIntegrationId: selectedTicketingIntegration?.integrationEntityId ?? null,
        primaryScmIntegrationId: scmIntegrationId !== NONE_OPTION ? scmIntegrationId : null,
        autoFixEnabled,
        autoFixTags: autoFixTags
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean),
      }

      const updatedProject = await updateProject(projectData.id, updates)

      if (scmIntegrationId !== NONE_OPTION) {
        const selectedScmIntegration = scmIntegrations.find(
          (integration) => integration.integrationEntityId === scmIntegrationId
        )
        if (!selectedScmIntegration) {
          throw new Error('Choose a code host linked to this space under Connections, or choose No code connection.')
        }

        const normalizedSourceRepository = sourceRepository.trim()
        if (!normalizedSourceRepository) {
          throw new Error('Enter the repository address, e.g. https://github.com/acme/storefront, or choose No code connection.')
        }

        const scmConfig = await upsertProjectScmConfig(projectData.id, {
          integrationId: selectedScmIntegration.integrationEntityId,
          sourceRepository: normalizedSourceRepository,
          baseBranch: normalizeOptionalText(baseBranch) || 'main',
          pullRequestRepository: normalizeOptionalText(pullRequestRepository),
          pullRequestBaseBranch: normalizeOptionalText(pullRequestBaseBranch),
          branchNameTemplate: normalizeOptionalText(branchNameTemplate),
          integrationCredentialId: integrationCredentialId !== NONE_OPTION ? integrationCredentialId : null,
        })
        setInitialScmConfig(scmConfig)
      } else if (initialScmConfig) {
        await deleteProjectScmConfig(projectData.id)
        setInitialScmConfig(null)
      }

      setSuccess('Space settings saved.')
      setName(updatedProject.name ?? '')
      setAutoFixEnabled(Boolean(updatedProject.autoFixEnabled))
      setAutoFixTags(updatedProject.autoFixTags?.join(', ') ?? '')
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Failed to update space'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isProjectLoading && !projectData) {
    return (
      <div className="mx-auto max-w-4xl p-6 lg:p-8">
        <Heading>Space settings</Heading>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">Loading space settings...</p>
      </div>
    )
  }

  return (
    <>
      <PageMeta title={projectData?.name ? `${projectData.name} | Settings` : 'Space settings'} />
      <div className="max-w-4xl">
        <Heading>Space settings</Heading>

        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">What this space is called, who can see it, and the code its agents work on.</p>

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
                  <Label>Name</Label>
                  <Description>How the space appears in the sidebar and on its tasks.</Description>
                  <Input name="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </Field>

                <div className="text-sm text-zinc-600 dark:text-zinc-400">
                  <span className="font-medium text-zinc-950 dark:text-white">Access: </span>
                  {projectData.isPrivate ? 'Private. Only its members see it.' : 'Open. Everyone in the workspace can see it.'}{' '}
                  <Link href={`/spaces/${project}/settings/members`} className="text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current">
                    Change access and members
                  </Link>
                </div>

                <div className="rounded-xl border border-zinc-950/10 p-6 dark:border-white/10">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <Label className="text-base">Repository</Label>
                      <Description>The code the agents work on: where they clone it, which branch they start from, and how they push.</Description>
                    </div>
                    <Link
                      href={`/spaces/${project}/settings/connections`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-burnt-orange hover:underline"
                    >
                      <GearIcon className="size-4" />
                      Connections
                    </Link>
                  </div>

                  {scmLoadError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-400">
                      {scmLoadError}
                    </div>
                  )}

                  <FieldGroup className="space-y-4">
                    <Field>
                      <Label>Code host</Label>
                      {isLoadingIntegrations || isLoadingScmConfig ? <Description>Loading code connections…</Description> : null}
                      <Select
                        name="scm_integration"
                        value={scmIntegrationId}
                        onChange={(value) => {
                          if (value === '') return
                          setScmIntegrationId(value)
                        }}
                        disabled={isLoadingIntegrations || isLoadingScmConfig || scmIntegrations.length === 0}
                      >
                        <option value={NONE_OPTION}>{scmIntegrations.length === 0 ? 'No code connection yet' : 'No code connection'}</option>
                        {scmIntegrations.map((integration) => (
                          <option key={integration.integrationEntityId} value={integration.integrationEntityId}>
                            {integration.label} ({integration.system})
                          </option>
                        ))}
                      </Select>
                      {scmIntegrations.length === 0 ? (
                        <Description className="mt-2">
                          Link GitHub, GitLab or Bitbucket under{' '}
                          <Link href={`/spaces/${project}/settings/connections`} className="text-brand-burnt-orange hover:underline">
                            Connections
                          </Link>{' '}
                          first.
                        </Description>
                      ) : null}
                    </Field>

                    <Field>
                      <Label>Repository address</Label>
                      <Description>The address you would clone, e.g. https://github.com/acme/storefront.</Description>
                      <Input
                        name="source_repository"
                        placeholder="https://github.com/acme/storefront"
                        value={sourceRepository}
                        onChange={(event) => setSourceRepository(event.target.value)}
                        disabled={scmIntegrationId === NONE_OPTION}
                      />
                    </Field>

                    <Field>
                      <Label>Default branch</Label>
                      <Description>Agents start from this branch and open pull requests into it. Usually main.</Description>
                      <Input
                        name="base_branch"
                        placeholder="main"
                        value={baseBranch}
                        onChange={(event) => setBaseBranch(event.target.value)}
                        disabled={scmIntegrationId === NONE_OPTION}
                      />
                    </Field>

                    <Field>
                      <Label>Access token</Label>
                      <Description>
                        The token agents clone and push with. It needs to read the repository and open pull requests. Tokens are added on
                        the{' '}
                        <Link href={`/settings/connections/${scmIntegrationId}`} className="text-brand-burnt-orange hover:underline">
                          connection
                        </Link>
                        .
                      </Description>
                      <Select
                        name="integration_credential_id"
                        value={integrationCredentialId}
                        onChange={(value) => {
                          // Radix can emit an empty transition value while options are reconciling.
                          if (value === '') return
                          setIntegrationCredentialId(value)
                        }}
                        disabled={scmIntegrationId === NONE_OPTION || isLoadingIntegrationCredentials}
                      >
                        <option value={NONE_OPTION}>{isLoadingIntegrationCredentials ? 'Loading tokens…' : 'Choose a token'}</option>
                        {integrationCredentials.map((credential) => (
                          <option key={credential.id} value={credential.id}>
                            {credential.name}
                            {credential.isDefault ? ' (default)' : ''}
                          </option>
                        ))}
                      </Select>
                      {integrationCredentialsError ? (
                        <Description className="mt-2 text-red-600 dark:text-red-400">{integrationCredentialsError}</Description>
                      ) : null}
                      {!isLoadingIntegrationCredentials && integrationCredentials.length === 0 && scmIntegrationId !== NONE_OPTION ? (
                        <Description className="mt-2">
                          This connection has no tokens yet. Add one on the{' '}
                          <Link href={`/settings/connections/${scmIntegrationId}`} className="text-brand-burnt-orange hover:underline">
                            connection
                          </Link>
                          .
                        </Description>
                      ) : null}
                    </Field>
                  </FieldGroup>
                </div>

                <div className="rounded-xl border border-zinc-950/10 p-6 dark:border-white/10">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <Label className="text-base">Issue tracker</Label>
                      <Description>Optional. Tasks can live in Viberglass alone, or sync with a tracker linked under Connections.</Description>
                    </div>
                    <Link
                      href={`/spaces/${project}/settings/connections`}
                      className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-burnt-orange hover:underline"
                    >
                      <GearIcon className="size-4" />
                      Connections
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
                  ) : (
                    <Field>
                      <Select
                        name="ticket_integration"
                        value={ticketingIntegrationId}
                        onChange={(value) => {
                          if (value === '') return
                          setTicketingIntegrationId(value)
                        }}
                        disabled={ticketingIntegrations.length === 0}
                      >
                        <option value={NONE_OPTION}>
                          {ticketingIntegrations.length === 0
                            ? 'No tracker linked: tasks live in Viberglass'
                            : 'None: tasks live in Viberglass'}
                        </option>
                        {ticketingIntegrations.map((integration) => (
                          <option key={integration.integrationEntityId} value={integration.integrationEntityId}>
                            {integration.label} ({integration.system})
                          </option>
                        ))}
                      </Select>
                      {ticketingIntegrations.length === 0 && (
                        <Description className="mt-2">
                          Tasks live in Viberglass. To sync them with an issue tracker,{' '}
                          <Link
                            href={`/spaces/${project}/settings/connections`}
                            className="text-brand-burnt-orange hover:underline"
                          >
                            link one under Connections
                          </Link>
                          .
                        </Description>
                      )}
                    </Field>
                  )}
                </div>


                <SpaceAdvancedSettings
                  hasRepository={scmIntegrationId !== NONE_OPTION}
                  pullRequestRepository={pullRequestRepository}
                  onPullRequestRepositoryChange={setPullRequestRepository}
                  pullRequestBaseBranch={pullRequestBaseBranch}
                  onPullRequestBaseBranchChange={setPullRequestBaseBranch}
                  branchNameTemplate={branchNameTemplate}
                  onBranchNameTemplateChange={setBranchNameTemplate}
                  autoFixEnabled={autoFixEnabled}
                  onAutoFixEnabledChange={setAutoFixEnabled}
                  autoFixTags={autoFixTags}
                  onAutoFixTagsChange={setAutoFixTags}
                  taskKeyExample={`${projectData.keyPrefix}-12`}
                />

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

        {projectData && (
          <div className="mt-16 space-y-6 border-t border-zinc-200 pt-8 dark:border-zinc-800">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Archive space</h3>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                Hide this space from active lists while retaining all tasks, runs, and configuration.
              </p>
              <Button className="mt-4" outline disabled={isArchiving} onClick={() => void handleArchiveProject()}>
                {isArchiving ? 'Archiving…' : 'Archive space'}
              </Button>
            </div>
            {isAdmin && (
            <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
              <h3 className="text-base font-semibold text-red-700 dark:text-red-400">Danger Zone</h3>
              <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
                Permanently delete this space and all associated data. This cannot be undone.
              </p>
              <div className="mt-4">
                <Button
                  color="red"
                  onClick={() => {
                    setDeleteConfirmName('')
                    setDeleteError(null)
                    setShowDeleteDialog(true)
                    void getProjectDeletionSummary(projectData.id)
                      .then(setDeletionSummary)
                      .catch(() => setDeletionSummary(null))
                  }}
                >
                  Delete Space
                </Button>
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      <Dialog
        open={showDeleteDialog}
        onClose={(open) => {
          if (!isDeleting) setShowDeleteDialog(open)
        }}
        size="md"
      >
        <DialogTitle>Delete Space</DialogTitle>
        <DialogDescription>
          This will permanently delete <strong>{projectData?.name}</strong> and all its tickets, runs, and
          configuration. This action cannot be undone.
        </DialogDescription>
        <DialogBody>
          <div className="space-y-3">
            {deletionSummary ? (
              <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
                Also deleted: {deletionSummary.tickets} tasks, {deletionSummary.runs} runs,{' '}
                {deletionSummary.sessions} agent sessions, and {deletionSummary.schedules} schedules.
              </p>
            ) : null}
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Type <strong className="font-mono text-zinc-900 dark:text-white">{projectData?.name}</strong> to confirm.
            </p>
            <Input
              value={deleteConfirmName}
              onChange={(e) => setDeleteConfirmName(e.target.value)}
              placeholder={projectData?.name}
              disabled={isDeleting}
            />
            {deleteError && <p className="text-sm text-red-600 dark:text-red-400">{deleteError}</p>}
          </div>
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setShowDeleteDialog(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button outline onClick={() => void handleArchiveProject()} disabled={isDeleting || isArchiving}>
            {isArchiving ? 'Archiving…' : 'Archive instead'}
          </Button>
          <Button
            color="red"
            onClick={handleDeleteProject}
            disabled={isDeleting || deleteConfirmName !== projectData?.name}
          >
            {isDeleting ? 'Deleting...' : 'Delete Space'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
