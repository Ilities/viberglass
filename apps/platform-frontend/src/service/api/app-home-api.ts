import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, AppHome, AppHomeStatus } from '@viberglass/types'

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || fallback)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

export async function getAppHome(): Promise<AppHomeStatus> {
  return readData(await apiFetch(`${API_BASE_URL}/api/app-home`), "Couldn't load the App home")
}

export async function saveAppHome(home: AppHome): Promise<AppHomeStatus> {
  const response = await apiFetch(`${API_BASE_URL}/api/app-home`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(home),
  })
  return readData(response, "Couldn't save the App home")
}

export async function removeAppHome(): Promise<AppHomeStatus> {
  return readData(await apiFetch(`${API_BASE_URL}/api/app-home`, { method: 'DELETE' }), "Couldn't remove the App home")
}
