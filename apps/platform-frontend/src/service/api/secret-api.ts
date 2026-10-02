import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  ModelProviderId,
  CreateSecretRequest,
  PaginatedResponse,
  Secret,
  SecretStorageDefaults,
  UpdateSecretRequest,
} from '@viberglass/types'

export async function getSecrets(limit: number = 50, offset: number = 0): Promise<Secret[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch secrets')
  }
  const data: PaginatedResponse<Secret> = await response.json()
  return data.data
}

const SECRET_PAGE_SIZE = 100

/** Every secret, fetched page by page; pickers and the Secrets page need the full list. */
export async function listAllSecrets(): Promise<Secret[]> {
  const secrets: Secret[] = []
  for (;;) {
    const page = await getSecrets(SECRET_PAGE_SIZE, secrets.length)
    secrets.push(...page)
    if (page.length < SECRET_PAGE_SIZE) {
      return secrets
    }
  }
}

export async function getSecret(id: string): Promise<Secret> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Secret not found')
    }
    throw new Error('Failed to fetch secret')
  }
  const data: ApiResponse<Secret> = await response.json()
  return data.data
}

/** Checks a model key with its provider without storing it; throws with the provider's reason. */
export async function checkModelKey(provider: ModelProviderId, key: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets/model-key-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, key }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || "Couldn't check the key")
  }
}

export async function createSecret(request: CreateSecretRequest): Promise<Secret> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to create secret')
  }

  const data: ApiResponse<Secret> = await response.json()
  return data.data
}

export async function updateSecret(id: string, updates: UpdateSecretRequest): Promise<Secret> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to update secret')
  }

  const data: ApiResponse<Secret> = await response.json()
  return data.data
}

export async function deleteSecret(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to delete secret')
  }
}

export type {
  CreateSecretRequest,
  Secret,
  SecretLocation,
  SecretStorageDefaults,
  UpdateSecretRequest,
} from '@viberglass/types'

export async function getSecretStorageDefaults(): Promise<SecretStorageDefaults> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets/storage-defaults`)
  if (!response.ok) {
    throw new Error('Failed to fetch secret storage defaults')
  }
  const data: ApiResponse<SecretStorageDefaults> = await response.json()
  return data.data
}
