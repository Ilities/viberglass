import { API_BASE_URL } from '@/lib'
import type { AuthUser } from '@/service/api/auth-api'
import { fetchOrExplain } from '@/service/api/client'
import { toErrorFromResponse, type UserRole } from '@/service/api/user-api'

// Opened by people who aren't signed in, so these don't use apiFetch's stored token.

export type InvitePreview = { email: string; role: UserRole; invitedByName: string | null; expiresAt: string }
export type ResetPreview = { email: string; name: string }
export type SignedIn = { token: string; user: AuthUser }

async function request<T>(path: string, fallback: string, body?: unknown): Promise<T> {
  const response = await fetchOrExplain(`${API_BASE_URL}/api/account-links/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'include',
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  return (await response.json()) as T
}

export function getInvitePreview(token: string): Promise<InvitePreview> {
  return request(`invites/${encodeURIComponent(token)}`, 'This invite link is not valid.')
}

export function acceptInvite(token: string, name: string, password: string): Promise<SignedIn> {
  return request(`invites/${encodeURIComponent(token)}`, 'Failed to accept the invite', { name, password })
}

export function getResetPreview(token: string): Promise<ResetPreview> {
  return request(`resets/${encodeURIComponent(token)}`, 'This reset link is not valid.')
}

export function resetPassword(token: string, password: string): Promise<SignedIn> {
  return request(`resets/${encodeURIComponent(token)}`, 'Failed to set the password', { password })
}
