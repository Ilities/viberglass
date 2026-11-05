import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import { saveDownload } from '@/service/api/space-files-api'
import type { ApiResponse, AppStartFrom, SpaceBackingOptions, SpaceBroughtIn } from '@viberglass/types'

async function readData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || fallback)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

const backingUrl = (projectId: string) => `${API_BASE_URL}/api/spaces/${encodeURIComponent(projectId)}/backing`

export async function getSpaceBackingOptions(projectId: string): Promise<SpaceBackingOptions> {
  return readData(await apiFetch(backingUrl(projectId)), "Couldn't load what this space can switch to")
}

export interface BringInAsApp {
  /** Only when the space needs a new name to work as an app's address. */
  name?: string
  startFrom: AppStartFrom
  file?: File
}

export async function bringSpaceInAsApp(projectId: string, request: BringInAsApp): Promise<SpaceBroughtIn> {
  const form = new FormData()
  form.append('startFrom', request.startFrom)
  if (request.name) form.append('name', request.name)
  if (request.file) form.append('file', request.file)
  return readData(
    await apiFetch(`${backingUrl(projectId)}/app`, { method: 'POST', body: form }),
    "Couldn't make this space an App space"
  )
}

export async function ejectSpaceApp(projectId: string): Promise<void> {
  await readData(await apiFetch(`${backingUrl(projectId)}/git`, { method: 'POST' }), "Couldn't stop hosting the app")
}

export function downloadLastAppData(projectId: string, slug: string): Promise<void> {
  return saveDownload(
    `${backingUrl(projectId)}/last-app-data`,
    `${slug}-app-data.db`,
    "Couldn't download the app's data"
  )
}
