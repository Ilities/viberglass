import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, TaskParticipant, TaskParticipantRole } from '@viberglass/types'

async function readParticipants(response: Response, fallback: string): Promise<TaskParticipant[]> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<TaskParticipant[]> = await response.json()
  return data.data
}

const base = (taskId: string) => `${API_BASE_URL}/api/tasks/${taskId}/participants`

export async function getParticipants(taskId: string): Promise<TaskParticipant[]> {
  return readParticipants(await apiFetch(base(taskId)), 'Failed to load the people on this task')
}

export async function setTaskOwner(taskId: string, userId: string): Promise<TaskParticipant[]> {
  return readParticipants(
    await apiFetch(`${base(taskId)}/owner`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    }),
    'Failed to change the owner'
  )
}

export async function addParticipant(taskId: string, userId: string, role: TaskParticipantRole): Promise<TaskParticipant[]> {
  return readParticipants(
    await apiFetch(base(taskId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, role }),
    }),
    'Failed to add the person'
  )
}

export async function removeParticipant(taskId: string, userId: string, role: TaskParticipantRole): Promise<TaskParticipant[]> {
  return readParticipants(await apiFetch(`${base(taskId)}/${userId}/${role}`, { method: 'DELETE' }), 'Failed to remove the person')
}
