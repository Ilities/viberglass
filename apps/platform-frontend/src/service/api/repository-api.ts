import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, NewRepository, RepositoryAccess, RepositoryOwner } from '@viberglass/types'

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || fallback)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

/** Where a code host connection's token (the chosen one, else its default) can create repositories. */
export async function getRepositoryOwners(
  integrationId: string,
  credentialId: string | null
): Promise<RepositoryOwner[]> {
  const query = credentialId ? `?${new URLSearchParams({ credentialId })}` : ''
  const response = await apiFetch(`${API_BASE_URL}/api/integrations/${integrationId}/repository-owners${query}`)
  return readData(response, "Couldn't load where this token can create repositories")
}

/** Creates a repository for the space with one of its code host connections; saving it as the space's repository is separate. */
export async function createSpaceRepository(
  projectId: string,
  request: NewRepository & { integrationId: string; integrationCredentialId: string | null }
): Promise<RepositoryAccess> {
  const response = await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/repositories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return readData(response, "Couldn't create the repository")
}
