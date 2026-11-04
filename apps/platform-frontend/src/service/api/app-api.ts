import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ApiResponse, AppAccessAddition, AppAccessList, AppHandoff, AppView, OpenableApp } from '@viberglass/types'

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

/** The apps the caller may open. */
export async function listOpenableApps(): Promise<OpenableApp[]> {
  return readData(await apiFetch(`${API_BASE_URL}/api/apps`), "Couldn't load your apps")
}

export async function getAppAccess(projectId: string): Promise<AppAccessList> {
  return readData(await apiFetch(`${appUrl(projectId)}/access`), "Couldn't load who can open the app")
}

/** Gives someone the app by email, inviting them when they have no account yet. */
export async function addAppAccess(projectId: string, email: string): Promise<AppAccessAddition> {
  const response = await apiFetch(`${appUrl(projectId)}/access`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  return readData(response, "Couldn't give them access")
}

export async function removeAppAccess(projectId: string, userId: string): Promise<AppAccessList> {
  return readData(
    await apiFetch(`${appUrl(projectId)}/access/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
    "Couldn't remove their access"
  )
}

export async function cancelAppInvite(projectId: string, inviteId: string): Promise<AppAccessList> {
  return readData(
    await apiFetch(`${appUrl(projectId)}/access/invites/${encodeURIComponent(inviteId)}`, { method: 'DELETE' }),
    "Couldn't cancel the invite"
  )
}
