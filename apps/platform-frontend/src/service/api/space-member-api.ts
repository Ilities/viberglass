import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, SpaceMember, SpaceRole } from '@viberglass/types'

async function readMembers(response: Response, fallback: string): Promise<SpaceMember[]> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<SpaceMember[]> = await response.json()
  return data.data
}

export async function getSpaceMembers(projectId: string): Promise<SpaceMember[]> {
  return readMembers(await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/members`), 'Failed to load the space members')
}

/** Adds the person, or changes their role; returns the updated member list. */
export async function setSpaceMember(projectId: string, userId: string, role: SpaceRole): Promise<SpaceMember[]> {
  return readMembers(
    await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/members/${userId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    }),
    'Failed to update the member'
  )
}

export async function removeSpaceMember(projectId: string, userId: string): Promise<SpaceMember[]> {
  return readMembers(
    await apiFetch(`${API_BASE_URL}/api/spaces/${projectId}/members/${userId}`, { method: 'DELETE' }),
    'Failed to remove the member'
  )
}
