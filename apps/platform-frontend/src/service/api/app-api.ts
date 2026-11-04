import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, AppHandoff, AppView } from '@viberglass/types'

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || fallback)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

const appUrl = (projectId: string) => `${API_BASE_URL}/api/spaces/${encodeURIComponent(projectId)}/app`

export async function getApp(projectId: string): Promise<AppView> {
  return readData(await apiFetch(appUrl(projectId)), "Couldn't load the app")
}

export async function turnAppOn(projectId: string): Promise<AppView> {
  return readData(await apiFetch(`${appUrl(projectId)}/on`, { method: 'POST' }), "Couldn't turn the app on")
}

export async function turnAppOff(projectId: string): Promise<AppView> {
  return readData(await apiFetch(`${appUrl(projectId)}/off`, { method: 'POST' }), "Couldn't turn the app off")
}

export async function getAppLogs(projectId: string): Promise<string> {
  const { logs } = await readData<{ logs: string }>(await apiFetch(`${appUrl(projectId)}/logs`), "Couldn't load the app's logs")
  return logs
}

/** Signs the caller in to an app on its own host, or says who can turn it on. */
export async function openApp(slug: string, returnPath: string): Promise<AppHandoff> {
  const response = await apiFetch(`${API_BASE_URL}/api/apps/${encodeURIComponent(slug)}/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnPath }),
  })
  return readData(response, "Couldn't open the app")
}
