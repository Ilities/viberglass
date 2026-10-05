import type { RepositoryAccess, SetupModelChoice, SetupStatus } from '@viberglass/types'

export type SetupStep = 'model' | 'repository' | 'space' | 'agent' | 'task'

const STORED_REPOSITORY_KEY = 'viberglass.setup.repository'
const SKIPPED_KEY = 'viberglass.setup.skipped'

/** The checked repository (no token), kept so a reload between steps doesn't ask for it again. */
export function readStoredRepository(): RepositoryAccess | null {
  try {
    const raw = localStorage.getItem(STORED_REPOSITORY_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    if (
      typeof value === 'object' &&
      value !== null &&
      'fullName' in value &&
      'url' in value &&
      'defaultBranch' in value &&
      typeof value.fullName === 'string' &&
      typeof value.url === 'string' &&
      typeof value.defaultBranch === 'string'
    ) {
      return { fullName: value.fullName, url: value.url, defaultBranch: value.defaultBranch, isPrivate: false }
    }
  } catch {
    // A malformed entry just means asking again.
  }
  return null
}

export function storeRepository(repository: RepositoryAccess): void {
  localStorage.setItem(STORED_REPOSITORY_KEY, JSON.stringify(repository))
}

/** An engineer can leave setup for the advanced settings; the dashboard then stops sending them here. */
export function markSetupSkipped(): void {
  localStorage.setItem(SKIPPED_KEY, 'true')
}

export function isSetupSkipped(): boolean {
  return localStorage.getItem(SKIPPED_KEY) === 'true'
}

/** Where setup picks up: the first step that isn't done yet. */
export function resumeSetup(
  status: SetupStatus,
  storedRepository: RepositoryAccess | null,
): { step: SetupStep; model: SetupModelChoice | null } {
  const model = modelOf(status)
  if (!model) return { step: 'model', model }
  if (!status.space) {
    return { step: status.repositoryConnected && storedRepository ? 'space' : 'repository', model }
  }
  if (status.agent?.status !== 'active') return { step: 'agent', model }
  return { step: 'task', model }
}

/** A stored provider key first, else a model endpoint that names a model to run. */
function modelOf(status: SetupStatus): SetupModelChoice | null {
  const provider = status.connectedProviders[0]
  if (provider) return { provider }
  const endpoint = status.connectedEndpoints.find((entry) => entry.models.length > 0)
  return endpoint ? { endpointId: endpoint.id, model: endpoint.models[0] } : null
}
