import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, WorkerCapacityStatus } from '@viberglass/types'

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || fallback)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

export async function getWorkerLimit(): Promise<WorkerCapacityStatus> {
  return readData(await apiFetch(`${API_BASE_URL}/api/worker-limit`), "Couldn't load the worker limit")
}

export async function saveWorkerLimit(maxRuns: number | null): Promise<WorkerCapacityStatus> {
  const response = await apiFetch(`${API_BASE_URL}/api/worker-limit`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ maxRuns }),
  })
  return readData(response, "Couldn't save the worker limit")
}
