import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, NotificationChannels } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

export async function getNotificationChannels(): Promise<NotificationChannels> {
  return read(await apiFetch(`${API_BASE_URL}/api/me/notification-channels`), 'Failed to load your notification settings')
}

export async function linkChat(system: string): Promise<void> {
  await read(await apiFetch(`${API_BASE_URL}/api/me/chat-links/${encodeURIComponent(system)}`, { method: 'POST' }), 'Failed to link your account')
}

/** Admins only: sends the signed-in admin a test email; rejects with the transport's own error. */
export async function sendTestEmail(): Promise<string> {
  return (await read<{ sentTo: string }>(await apiFetch(`${API_BASE_URL}/api/me/test-email`, { method: 'POST' }), 'Failed to send')).sentTo
}

export async function unlinkChat(system: string): Promise<void> {
  await read(await apiFetch(`${API_BASE_URL}/api/me/chat-links/${encodeURIComponent(system)}`, { method: 'DELETE' }), 'Failed to unlink your account')
}
