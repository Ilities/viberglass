import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, CreateSecretRequest, PaginatedResponse, Secret, UpdateSecretRequest } from '@viberglass/types'

export async function getSecrets(limit: number = 50, offset: number = 0): Promise<Secret[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/secrets?limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch secrets')
  }
  const data: PaginatedResponse<Secret> = await response.json()
  return data.data
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

export type { CreateSecretRequest, Secret, SecretLocation, UpdateSecretRequest } from '@viberglass/types'
