import { getPeopleDirectory, type Person } from '@/service/api/user-api'
import { useCallback, useEffect, useState } from 'react'

let directory: Promise<Person[]> | null = null

function loadDirectory(): Promise<Person[]> {
  directory ??= getPeopleDirectory().catch((error: unknown) => {
    directory = null
    throw error
  })
  return directory
}

/** Only for tests: forget the cached directory. */
export function resetPeopleDirectory() {
  directory = null
}

/**
 * Turns a stored actor into a name. Actors are stored as a user id or an
 * email depending on where they came from, so both are matched. Anything
 * unmatched is shown as stored.
 */
export function usePersonName(): (actor: string | null | undefined) => string | null {
  const [people, setPeople] = useState<Person[]>([])

  useEffect(() => {
    let cancelled = false
    loadDirectory()
      .then((loaded) => !cancelled && setPeople(loaded))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  return useCallback(
    (actor) => {
      if (!actor) return null
      const key = actor.trim().toLowerCase()
      const person = people.find((p) => p.id === actor || p.email.toLowerCase() === key)
      return person?.name?.trim() || actor
    },
    [people]
  )
}
