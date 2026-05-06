import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

export interface ApiToken {
  id: string
  name: string
  tokenPrefix: string
  lastUsedAt: string | null
  expiresAt: string | null
  createdAt: string
}

export interface CreateApiTokenResponse {
  id: string
  name: string
  token: string
  tokenPrefix: string
  expiresAt: string | null
  createdAt: string
}

export async function listApiTokens(): Promise<ApiToken[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/api-tokens`)
  if (!response.ok) {
    throw new Error('Failed to fetch API tokens')
  }
  const data = await response.json()
  return data.data
}

export async function createApiToken(name: string, expiresAt?: string | null): Promise<CreateApiTokenResponse> {
  const body: Record<string, unknown> = { name }
  if (expiresAt !== undefined) {
    body.expiresAt = expiresAt
  }

  const response = await apiFetch(`${API_BASE_URL}/api/api-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to create API token')
  }

  const data = await response.json()
  return data.data
}

export async function deleteApiToken(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/api-tokens/${id}`, {
    method: 'DELETE',
  })
  if (!response.ok && response.status !== 204) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Failed to delete API token')
  }
}
