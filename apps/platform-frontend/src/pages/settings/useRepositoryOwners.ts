import { getRepositoryOwners } from '@/service/api/repository-api'
import type { RepositoryOwner } from '@viberglass/types'
import { useEffect, useState } from 'react'

/** Where a connection's token (the chosen one, else its default) can create repositories. */
export function useRepositoryOwners(integrationId: string | null, credentialId: string | null) {
  const [list, setList] = useState<RepositoryOwner[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setList([])
    setError(null)
    if (!integrationId) return
    let isActive = true
    setIsLoading(true)
    getRepositoryOwners(integrationId, credentialId)
      .then((owners) => isActive && setList(owners))
      .catch((err: unknown) => isActive && setError(err instanceof Error ? err.message : "Couldn't load where this token can create repositories"))
      .finally(() => isActive && setIsLoading(false))
    return () => {
      isActive = false
    }
  }, [integrationId, credentialId])

  return { list, isLoading, error }
}
