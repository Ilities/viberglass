import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, TaskCapabilities } from '@viberglass/types'

/** What the signed-in person may ask the agent for on a task. */
export async function getTaskCapabilities(taskId: string): Promise<TaskCapabilities> {
  const response = await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/capabilities`)
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), 'Failed to load what you can ask for on this task')
  const data: ApiResponse<TaskCapabilities> = await response.json()
  return data.data
}
