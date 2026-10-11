import { getIntegrationManifests, getIntegrationCredentials, getIntegrations } from '@/service/api/integration-api'
import type { IntegrationCredential } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { NO_SELECTION, connectionOptionLabel, type ConnectionOption } from './RepositoryFields'

/** The workspace's code hosts and trackers a new space can use, and the access tokens of the chosen code host. */
export function useWorkspaceConnections(codeHostId: string) {
  const [codeHosts, setCodeHosts] = useState<ConnectionOption[]>([])
  const [trackers, setTrackers] = useState<ConnectionOption[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [tokens, setTokens] = useState<IntegrationCredential[]>([])
  const [isLoadingTokens, setIsLoadingTokens] = useState(false)
  const [tokensError, setTokensError] = useState<string | null>(null)

  useEffect(() => {
    let isActive = true
    Promise.all([getIntegrationManifests(), getIntegrations()])
      .then(([types, connections]) => {
        if (!isActive) return
        const typeBySystem = new Map(types.map((type) => [type.id, type]))
        const working = connections.filter((connection) => typeBySystem.get(connection.system)?.status !== 'stub')
        const options = working.map((connection) => {
          const type = typeBySystem.get(connection.system)
          return {
            id: connection.id,
            label: connectionOptionLabel(connection.name, type?.label ?? connection.system),
            category: type?.category ?? 'ticketing',
          }
        })
        setCodeHosts(options.filter((option) => option.category === 'scm'))
        setTrackers(options.filter((option) => option.category === 'ticketing'))
      })
      .catch((err: unknown) => {
        if (isActive) setLoadError(err instanceof Error ? err.message : 'Failed to load connections')
      })
      .finally(() => {
        if (isActive) setIsLoading(false)
      })
    return () => {
      isActive = false
    }
  }, [])

  useEffect(() => {
    setTokens([])
    setTokensError(null)
    if (codeHostId === NO_SELECTION) return
    let isActive = true
    setIsLoadingTokens(true)
    getIntegrationCredentials(codeHostId)
      .then((loaded) => {
        if (isActive) setTokens(loaded)
      })
      .catch((err: unknown) => {
        if (isActive) setTokensError(err instanceof Error ? err.message : 'Failed to load access tokens')
      })
      .finally(() => {
        if (isActive) setIsLoadingTokens(false)
      })
    return () => {
      isActive = false
    }
  }, [codeHostId])

  return { codeHosts, trackers, isLoading, loadError, tokens, isLoadingTokens, tokensError }
}
