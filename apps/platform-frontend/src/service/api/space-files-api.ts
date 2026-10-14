import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type {
  ApiResponse,
  SaveSpaceTextFileRequest,
  SpaceFileChangeResult,
  SpaceFileChangeSummary,
  SpaceFilesListing,
  SpaceFilesSnapshotSummary,
  SpaceTextFile,
  TurnArtifact,
} from '@viberglass/types'

/** A refused request, with the server's code when it gave one, such as FILE_CHANGED or SPACE_BUSY. */
export class SpaceRequestError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly status?: number
  ) {
    super(message)
    this.name = 'SpaceRequestError'
  }
}

export async function readSpaceData<T>(response: Response, fallback: string): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new SpaceRequestError(body.error || body.message || fallback, body.code, response.status)
  }
  const body: ApiResponse<T> = await response.json()
  return body.data
}

/** The file name a download should be saved as, from its Content-Disposition, else `fallback`. */
function attachmentName(response: Response, fallback: string): string {
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(disposition)
  if (encoded) return decodeURIComponent(encoded[1])
  const plain = /filename="?([^";]+)"?/i.exec(disposition)
  return plain ? plain[1] : fallback
}

/** Downloads with the person's credentials, which a plain link can't carry, and saves the file. */
export async function saveDownload(url: string, fallbackName: string, failure: string): Promise<void> {
  const response = await apiFetch(url)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new SpaceRequestError(body.error || failure, body.code, response.status)
  }
  const blob = await response.blob()
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = attachmentName(response, fallbackName)
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}

const filesUrl = (projectId: string, suffix = '') => `${API_BASE_URL}/api/spaces/${projectId}/files${suffix}`
const withPath = (path: string) => `?path=${encodeURIComponent(path)}`

export async function getSpaceFiles(projectId: string): Promise<SpaceFilesListing> {
  return readSpaceData(await apiFetch(filesUrl(projectId)), "Couldn't load the space's files")
}

/** What a run saved of its space's files, and the artifacts it made; `files` is null for a run that saved none. */
export interface RunFilesOutcome {
  files: SpaceFilesSnapshotSummary | null
  artifacts: TurnArtifact[]
}

export async function getRunFiles(jobId: string): Promise<RunFilesOutcome> {
  return readSpaceData(await apiFetch(`${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/files`), "Couldn't load the run's files")
}

export async function getSpaceTextFile(projectId: string, path: string): Promise<SpaceTextFile> {
  return readSpaceData(await apiFetch(filesUrl(projectId, `/text${withPath(path)}`)), "Couldn't open the file")
}

export async function saveSpaceTextFile(
  projectId: string,
  request: SaveSpaceTextFileRequest
): Promise<{ snapshot: SpaceFilesSnapshotSummary; file: SpaceTextFile } | { queued: SpaceFileChangeSummary }> {
  const response = await apiFetch(filesUrl(projectId, '/text'), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  return readSpaceData(response, "Couldn't save the file")
}

export async function uploadSpaceFile(
  projectId: string,
  file: File,
  path: string
): Promise<SpaceFileChangeResult> {
  const form = new FormData()
  form.append('file', file)
  form.append('path', path)
  return readSpaceData(await apiFetch(filesUrl(projectId), { method: 'POST', body: form }), "Couldn't upload the file")
}

export async function deleteSpaceFile(projectId: string, path: string): Promise<SpaceFileChangeResult> {
  return readSpaceData(await apiFetch(filesUrl(projectId, withPath(path)), { method: 'DELETE' }), "Couldn't delete the file")
}

export function downloadSpaceFile(projectId: string, path: string): Promise<void> {
  return saveDownload(filesUrl(projectId, `/download${withPath(path)}`), path.split('/').pop() ?? path, "Couldn't download the file")
}

/** What a change waiting for the space, or one that couldn't be saved, would have written. */
export function downloadSpaceFileChange(projectId: string, change: SpaceFileChangeSummary): Promise<void> {
  return saveDownload(
    filesUrl(projectId, `/changes/${change.id}/content`),
    change.path.split('/').pop() ?? change.path,
    "Couldn't download your version"
  )
}

export async function dismissSpaceFileChange(projectId: string, changeId: string): Promise<void> {
  await readSpaceData(await apiFetch(filesUrl(projectId, `/changes/${changeId}`), { method: 'DELETE' }), "Couldn't dismiss the change")
}
