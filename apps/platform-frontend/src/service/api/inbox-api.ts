import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, InboxItem, MyTask } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

export async function getInbox(state: 'open' | 'done'): Promise<{ items: InboxItem[]; unread: number }> {
  return read(await apiFetch(`${API_BASE_URL}/api/inbox?state=${state}`), 'Failed to load your Inbox')
}

export async function getInboxUnreadCount(): Promise<number> {
  return (await read<{ unread: number }>(await apiFetch(`${API_BASE_URL}/api/inbox/count`), 'Failed to load your Inbox')).unread
}

export async function updateInboxItem(id: string, change: { read?: boolean; done?: boolean; snoozeHours?: number }): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/inbox/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(change),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to update the item')
}

export async function getMyTasks(): Promise<MyTask[]> {
  return read(await apiFetch(`${API_BASE_URL}/api/inbox/my-tasks`), 'Failed to load your tasks')
}
