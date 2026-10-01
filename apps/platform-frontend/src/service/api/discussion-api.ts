import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, TaskActivityEntry, TaskMessage } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

export async function getTaskMessages(taskId: string): Promise<TaskMessage[]> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/messages`), 'Failed to load the discussion')
}

/** Returns the whole thread after posting. */
export async function postTaskMessage(taskId: string, body: string): Promise<TaskMessage[]> {
  return read(
    await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    }),
    'Failed to post the message'
  )
}

export async function getTaskActivity(taskId: string): Promise<TaskActivityEntry[]> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/activity`), 'Failed to load the activity')
}
