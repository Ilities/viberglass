import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse, type UserRole } from '@/service/api/user-api'

export type Invite = {
  id: string
  email: string
  role: UserRole
  spaceIds: string[]
  invitedByName: string | null
  createdAt: string
  expiresAt: string
}

export async function getInvites(): Promise<Invite[]> {
  const response = await apiFetch(`${API_BASE_URL}/api/invites`)
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to load invites')
  const data = (await response.json()) as { invites: Invite[] }
  return data.invites
}

/** Returns the invite and its link path, which is shown only this once. */
export async function createInvite(
  email: string,
  role: UserRole,
  spaceIds: string[]
): Promise<{ invite: Invite; path: string; emailed: boolean }> {
  const response = await apiFetch(`${API_BASE_URL}/api/invites`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, role, spaceIds }),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to create the invite')
  return (await response.json()) as { invite: Invite; path: string; emailed: boolean }
}

export async function revokeInvite(id: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/invites/${id}`, { method: 'DELETE' })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to revoke the invite')
}
