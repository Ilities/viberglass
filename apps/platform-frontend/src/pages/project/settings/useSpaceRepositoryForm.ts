import { getErrorMessage } from '@/lib/project-form'
import {
  getAvailableIntegrationTypes,
  getIntegrationCredentials,
  getProjectIntegrations,
  type AvailableIntegrationType,
  type ProjectIntegrationWithDetails,
} from '@/service/api/integration-api'
import {
  deleteProjectScmConfig,
  getProjectScmConfig,
  updateProject,
  upsertProjectScmConfig,
  type Project,
  type ProjectScmConfig,
} from '@/service/api/project-api'
import type { IntegrationCategory, IntegrationCredential, TicketSystem } from '@viberglass/types'
import { useEffect, useMemo, useState } from 'react'
import { NO_SELECTION, connectionOptionLabel, type ConnectionOption } from './RepositoryFields'

interface LinkedConnection extends ConnectionOption {
  system: TicketSystem
  category: IntegrationCategory
}

function normalizeOptionalText(value: string): string | null {
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function mapLinkedConnections(
  links: ProjectIntegrationWithDetails[],
  typeBySystem: Map<TicketSystem, AvailableIntegrationType>
): LinkedConnection[] {
  return links.map((link) => {
    const type = typeBySystem.get(link.integration.system)
    return {
      id: link.integration.id,
      label: connectionOptionLabel(link.integration.name, type?.label ?? link.integration.system),
      system: link.integration.system,
      category: type?.category ?? 'inbound',
    }
  })
}

/** The tracker a space syncs with: its primary one, else the one matching its legacy ticket system. */
function trackerOf(project: Project, trackers: LinkedConnection[]): string {
  const match = project.primaryTicketingIntegrationId
    ? trackers.find((tracker) => tracker.id === project.primaryTicketingIntegrationId)
    : trackers.find((tracker) => tracker.system === project.ticketSystem)
  return match?.id ?? NO_SELECTION
}

/** State, loading and saving for a space's repository, issue tracker and advanced settings. */
export function useSpaceRepositoryForm(project: Project | null) {
  const [linked, setLinked] = useState<LinkedConnection[]>([])
  const [trackerId, setTrackerId] = useState<string>(NO_SELECTION)
  const [codeHostId, setCodeHostId] = useState<string>(NO_SELECTION)
  const [isLoadingConnections, setIsLoadingConnections] = useState(true)
  const [connectionsError, setConnectionsError] = useState<string | null>(null)

  const [repositoryAddress, setRepositoryAddress] = useState('')
  const [defaultBranch, setDefaultBranch] = useState('main')
  const [pullRequestRepository, setPullRequestRepository] = useState('')
  const [pullRequestBaseBranch, setPullRequestBaseBranch] = useState('')
  const [branchNameTemplate, setBranchNameTemplate] = useState('')
  const [tokenId, setTokenId] = useState<string>(NO_SELECTION)
  const [initialScmConfig, setInitialScmConfig] = useState<ProjectScmConfig | null>(null)
  const [isLoadingScmConfig, setIsLoadingScmConfig] = useState(true)
  const [scmLoadError, setScmLoadError] = useState<string | null>(null)

  const [tokens, setTokens] = useState<IntegrationCredential[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokensError, setTokensError] = useState<string | null>(null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const trackers = useMemo(() => linked.filter((connection) => connection.category === 'ticketing'), [linked])
  const codeHosts = useMemo(() => linked.filter((connection) => connection.category === 'scm'), [linked])

  function applyScmConfig(config: ProjectScmConfig | null, fallbackCodeHostId: string) {
    setCodeHostId(config?.integrationId ?? fallbackCodeHostId)
    setRepositoryAddress(config?.sourceRepository ?? '')
    setDefaultBranch(config?.baseBranch || 'main')
    setPullRequestRepository(config?.pullRequestRepository ?? '')
    setPullRequestBaseBranch(config?.pullRequestBaseBranch ?? '')
    setBranchNameTemplate(config?.branchNameTemplate ?? '')
  }

  useEffect(() => {
    if (!project?.id) return
    setError(null)
    setSuccess(null)
  }, [project?.id])

  useEffect(() => {
    let isActive = true
    async function loadLinkedConnections() {
      if (!project?.id) {
        setIsLoadingConnections(false)
        return
      }
      setIsLoadingConnections(true)
      setConnectionsError(null)
      try {
        const [availableTypes, links] = await Promise.all([
          getAvailableIntegrationTypes(),
          getProjectIntegrations(project.id),
        ])
        if (!isActive) return
        const mapped = mapLinkedConnections(links, new Map(availableTypes.map((type) => [type.id, type])))
        setLinked(mapped)
        setTrackerId(
          trackerOf(
            project,
            mapped.filter((connection) => connection.category === 'ticketing')
          )
        )

        const scmId = initialScmConfig?.integrationId ?? project.primaryScmIntegrationId
        if (scmId) {
          const scmMatch = mapped.find((connection) => connection.category === 'scm' && connection.id === scmId)
          setCodeHostId(scmMatch?.id ?? NO_SELECTION)
        }
      } catch (loadError) {
        if (!isActive) return
        setLinked([])
        setTrackerId(NO_SELECTION)
        setConnectionsError(loadError instanceof Error ? loadError.message : 'Failed to load linked connections')
      } finally {
        if (isActive) setIsLoadingConnections(false)
      }
    }
    void loadLinkedConnections()
    return () => {
      isActive = false
    }
  }, [project, initialScmConfig?.integrationId])

  useEffect(() => {
    let isActive = true
    async function loadScmConfig() {
      if (!project?.id) {
        setIsLoadingScmConfig(false)
        return
      }
      setIsLoadingScmConfig(true)
      setScmLoadError(null)
      try {
        const scmConfig = await getProjectScmConfig(project.id)
        if (!isActive) return
        setInitialScmConfig(scmConfig)
        applyScmConfig(scmConfig, project.primaryScmIntegrationId ?? NO_SELECTION)
        // The saved token is picked once the code host's tokens have loaded, so the select never holds a missing option.
        setTokenId(NO_SELECTION)
      } catch (loadError) {
        if (!isActive) return
        setScmLoadError(loadError instanceof Error ? loadError.message : 'Failed to load the repository settings')
      } finally {
        if (isActive) setIsLoadingScmConfig(false)
      }
    }
    void loadScmConfig()
    return () => {
      isActive = false
    }
  }, [project?.id, project?.primaryScmIntegrationId])

  useEffect(() => {
    let isActive = true
    async function loadTokens() {
      if (codeHostId === NO_SELECTION || !codeHostId) {
        setTokens([])
        setIsLoadingTokens(false)
        return
      }
      setIsLoadingTokens(true)
      setTokensError(null)
      try {
        const loaded = await getIntegrationCredentials(codeHostId)
        if (!isActive) return
        setTokens(loaded)
        setTokenId((current) => {
          if (current !== NO_SELECTION && loaded.some((token) => token.id === current)) return current
          const saved = initialScmConfig?.integrationId === codeHostId ? initialScmConfig.integrationCredentialId : null
          return saved && loaded.some((token) => token.id === saved) ? saved : NO_SELECTION
        })
      } catch (loadError) {
        if (!isActive) return
        setTokens([])
        setTokensError(loadError instanceof Error ? loadError.message : 'Failed to load access tokens')
      } finally {
        if (isActive) setIsLoadingTokens(false)
      }
    }
    void loadTokens()
    return () => {
      isActive = false
    }
  }, [initialScmConfig?.integrationCredentialId, initialScmConfig?.integrationId, codeHostId])

  function reset() {
    if (!project) return
    setTrackerId(trackerOf(project, trackers))
    const primaryCodeHost = codeHosts.find((codeHost) => codeHost.id === project.primaryScmIntegrationId)
    applyScmConfig(initialScmConfig, primaryCodeHost?.id ?? NO_SELECTION)
    setTokenId(initialScmConfig?.integrationCredentialId ?? NO_SELECTION)
    setError(null)
    setSuccess(null)
  }

  async function save() {
    if (!project) return
    setIsSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      await updateProject(project.id, {
        primaryTicketingIntegrationId: trackers.find((tracker) => tracker.id === trackerId)?.id ?? null,
        primaryScmIntegrationId: codeHostId !== NO_SELECTION ? codeHostId : null,
      })

      if (codeHostId !== NO_SELECTION) {
        const codeHost = codeHosts.find((candidate) => candidate.id === codeHostId)
        if (!codeHost) throw new Error('Choose a code host linked to this space under Connections, or choose None.')
        const address = repositoryAddress.trim()
        if (!address)
          throw new Error('Enter the repository address, e.g. https://github.com/acme/storefront, or choose None.')
        setInitialScmConfig(
          await upsertProjectScmConfig(project.id, {
            integrationId: codeHost.id,
            sourceRepository: address,
            baseBranch: normalizeOptionalText(defaultBranch) || 'main',
            pullRequestRepository: normalizeOptionalText(pullRequestRepository),
            pullRequestBaseBranch: normalizeOptionalText(pullRequestBaseBranch),
            branchNameTemplate: normalizeOptionalText(branchNameTemplate),
            integrationCredentialId: tokenId !== NO_SELECTION ? tokenId : null,
          })
        )
      } else if (initialScmConfig) {
        await deleteProjectScmConfig(project.id)
        setInitialScmConfig(null)
      }

      setSuccess('Saved.')
    } catch (submitError) {
      setError(getErrorMessage(submitError, 'Failed to save the repository settings'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return {
    codeHosts,
    trackers,
    codeHostId,
    setCodeHostId,
    trackerId,
    setTrackerId,
    isLoadingConnections: isLoadingConnections || isLoadingScmConfig,
    loadError: connectionsError ?? scmLoadError,
    repositoryAddress,
    setRepositoryAddress,
    defaultBranch,
    setDefaultBranch,
    pullRequestRepository,
    setPullRequestRepository,
    pullRequestBaseBranch,
    setPullRequestBaseBranch,
    branchNameTemplate,
    setBranchNameTemplate,
    tokens,
    tokenId,
    setTokenId,
    isLoadingTokens,
    tokensError,
    isSubmitting,
    error,
    success,
    reset,
    save,
  }
}
