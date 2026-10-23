import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { toErrorFromResponse } from '@/service/api/user-api'
import type { ApiResponse, StartTaskComparisonRequest, TaskComparisonsView } from '@viberglass/types'

async function read(response: Response, fallback: string): Promise<TaskComparisonsView> {
  if (!response.ok) throw toErrorFromResponse(await response.json().catch(() => ({})), fallback)
  const data: ApiResponse<TaskComparisonsView> = await response.json()
  return data.data
}

/** The task's comparisons of agents, and, on a fork, the comparison it belongs to. */
export async function getTaskComparisons(taskId: string): Promise<TaskComparisonsView> {
  return read(await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/comparisons`), 'Failed to load the comparisons')
}

/** Forks the task once per agent and sends each fork the same ask. */
export async function startTaskComparison(taskId: string, request: StartTaskComparisonRequest): Promise<TaskComparisonsView> {
  return read(
    await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/comparisons`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    }),
    "Couldn't start the comparison"
  )
}

/** Points the task at one fork's work, or at none with null. */
export async function pickComparisonWinner(taskId: string, comparisonId: string, ticketId: string | null): Promise<TaskComparisonsView> {
  return read(
    await apiFetch(`${API_BASE_URL}/api/tasks/${taskId}/comparisons/${comparisonId}/winner`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticketId }),
    }),
    "Couldn't pick the winner"
  )
}
