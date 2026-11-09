import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  AppAccessAddition,
  AppAccessList,
  AppDataBackup,
  AppDataGrant,
  AppHandoff,
  AppSettingsView,
  AppView,
  OpenableApp,
  SaveAppSettingRequest,
} from '@viberglass/types'

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

/** Makes an earlier release live again, or one a rollback set aside, with its data or today's. */
export async function rollBackApp(projectId: string, releaseId: string, withData: boolean): Promise<AppView> {
  const response = await apiFetch(`${appUrl(projectId)}/releases/${encodeURIComponent(releaseId)}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ withData }),
  })
  return readData(response, "Couldn't roll the app back")
}

/** Newest first. */
export async function getAppBackups(projectId: string): Promise<AppDataBackup[]> {
  return readData(await apiFetch(`${appUrl(projectId)}/backups`), "Couldn't load the app's backups")
}

/** The app stops for the copy and starts again in the background. */
export async function backUpApp(projectId: string): Promise<AppView> {
  return readData(await apiFetch(`${appUrl(projectId)}/backups`, { method: 'POST' }), "Couldn't back up the app's data")
}

export async function getAppLogs(projectId: string): Promise<string> {
  const { logs } = await readData<{ logs: string }>(
    await apiFetch(`${appUrl(projectId)}/logs`),
    "Couldn't load the app's logs"
  )
  return logs
}

/** Signs the caller in to an app on its own host, or says who can turn it on. */
export async function openApp(slug: string, returnPath: string, state: string | null): Promise<AppHandoff> {
  const response = await apiFetch(`${API_BASE_URL}/api/apps/${encodeURIComponent(slug)}/handoff`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnPath, state }),
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

export async function getAppSettings(projectId: string): Promise<AppSettingsView> {
  return readData(await apiFetch(`${appUrl(projectId)}/settings`), "Couldn't load the app's settings")
}

/** Saving restarts the running app with the new value. */
export async function saveAppSetting(
  projectId: string,
  name: string,
  request: SaveAppSettingRequest
): Promise<AppSettingsView> {
  const response = await apiFetch(`${appUrl(projectId)}/settings/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return readData(response, "Couldn't save the setting")
}

export async function removeAppSetting(projectId: string, name: string): Promise<AppSettingsView> {
  return readData(
    await apiFetch(`${appUrl(projectId)}/settings/${encodeURIComponent(name)}`, { method: 'DELETE' }),
    "Couldn't remove the setting"
  )
}

const grantUrl = (taskId: string) => `${API_BASE_URL}/api/tasks/${encodeURIComponent(taskId)}/app-data-grant`

/** The copy of the app's data waiting for the task's next turn, if there is one. */
export async function getAppDataGrant(taskId: string): Promise<AppDataGrant | null> {
  return readData(await apiFetch(grantUrl(taskId)), "Couldn't check for a copy of the app's data")
}

export async function grantAppData(taskId: string): Promise<AppDataGrant> {
  return readData(await apiFetch(grantUrl(taskId), { method: 'POST' }), "Couldn't copy the app's data")
}

export async function withdrawAppDataGrant(taskId: string): Promise<void> {
  const response = await apiFetch(grantUrl(taskId), { method: 'DELETE' })
  if (!response.ok) await readData(response, "Couldn't withdraw the copy of the app's data")
}
