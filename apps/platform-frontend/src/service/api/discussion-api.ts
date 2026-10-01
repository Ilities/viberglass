import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, TaskMessage, TaskTimelineEntry } from '@viberglass/types'

async function read<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<T> = await response.json()
  return data.data
}

/** The task's thread: messages, document versions and what happened, oldest first. */
export async function getTaskTimeline(taskId: string): Promise<TaskTimelineEntry[]> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/timeline`), 'Failed to load the thread')
}


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
