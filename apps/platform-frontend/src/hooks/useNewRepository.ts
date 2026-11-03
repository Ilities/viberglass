import type { RepositoryOwner } from '@viberglass/types'
import { useEffect, useEffectEvent, useState } from 'react'

export type RepositorySource = 'existing' | 'new'

export interface NewRepositoryForm {
  source: RepositorySource
  setSource: (source: RepositorySource) => void
  owners: RepositoryOwner[]
  isLoadingOwners: boolean
  ownersError: string | null
  owner: string
  setOwner: (owner: string) => void
  name: string
  setName: (name: string) => void
  /** Set when the form is complete enough to create the repository. */
  isReady: boolean
}

/**
 * The "create a new repository" half of a repository form: the owners the
 * token can create under, loaded again whenever `ownersKey` changes (null
 * while there's nothing to load them with), and the owner and name chosen.
 * The name follows `suggestedName` until someone types one.
 */
export function useNewRepository(
  ownersKey: string | null,
  loadOwners: () => Promise<RepositoryOwner[]>,
  suggestedName = ''
): NewRepositoryForm {
  const [source, setSource] = useState<RepositorySource>('existing')
  const [owners, setOwners] = useState<RepositoryOwner[]>([])
  const [isLoadingOwners, setIsLoadingOwners] = useState(false)
  const [ownersError, setOwnersError] = useState<string | null>(null)
  const [owner, setOwner] = useState('')
  const [typedName, setTypedName] = useState<string | null>(null)
  const name = typedName ?? suggestedName
  const load = useEffectEvent(loadOwners)

  const activeKey = source === 'new' ? ownersKey : null
  useEffect(() => {
    setOwners([])
    setOwnersError(null)
    if (activeKey === null) return
    let isActive = true
    setIsLoadingOwners(true)
    load()
      .then((loaded) => {
        if (!isActive) return
        setOwners(loaded)
        setOwner((current) =>
          loaded.some((candidate) => candidate.name === current) ? current : (loaded[0]?.name ?? '')
        )
      })
      .catch((error: unknown) => {
        if (isActive)
          setOwnersError(
            error instanceof Error ? error.message : "Couldn't load where this token can create repositories."
          )
      })
      .finally(() => {
        if (isActive) setIsLoadingOwners(false)
      })
    return () => {
      isActive = false
    }
  }, [activeKey])

  return {
    source,
    setSource,
    owners,
    isLoadingOwners,
    ownersError,
    owner,
    setOwner,
    name,
    setName: setTypedName,
    isReady: owners.some((candidate) => candidate.name === owner) && name.trim().length > 0,
  }
}
