import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, HomeData, OverviewData } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

export async function getHome(): Promise<HomeData> {
  return read(await apiFetch(`${API_BASE_URL}/api/home`), 'Failed to load your tasks')
}

export async function updateAttention(taskId: string, data: { source: string; mode: 'acknowledged' | 'waiting' | 'later' | 'clear' | 'handled'; reason?: string; remindAt?: string }): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/home/attention/${encodeURIComponent(taskId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
  })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to update the request')
}

export async function getNeedsYouCount(): Promise<number> {
  return (await read<{ needsYou: number }>(await apiFetch(`${API_BASE_URL}/api/home/count`), 'Failed to load your tasks')).needsYou
}

export async function getOverview(space?: string): Promise<OverviewData> {
  const query = space ? `?space=${encodeURIComponent(space)}` : ''
  return read(await apiFetch(`${API_BASE_URL}/api/overview${query}`), 'Failed to load the overview')
}

/** Marks the task's thread read up to now. */
export async function markTaskRead(taskId: string): Promise<void> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/read`, { method: 'POST' })
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to mark the task read')
}
