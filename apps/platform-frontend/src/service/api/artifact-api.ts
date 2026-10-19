import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'
import type { ArtifactDetail, ArtifactPreview, ArtifactSummary } from '@viberglass/types'
import { readSpaceData, saveDownload } from './space-files-api'

const artifactsUrl = (projectId: string, suffix = '') => `${API_BASE_URL}/api/spaces/${projectId}/artifacts${suffix}`

/** The space's artifacts, newest first; with `taskId`, only that task's. */
export async function getArtifacts(projectId: string, taskId?: string): Promise<ArtifactSummary[]> {
  const query = taskId ? `?taskId=${encodeURIComponent(taskId)}` : ''
  return readSpaceData(await apiFetch(artifactsUrl(projectId, query)), "Couldn't load the artifacts")
}

export async function getArtifact(projectId: string, artifactId: string): Promise<ArtifactDetail> {
  return readSpaceData(await apiFetch(artifactsUrl(projectId, `/${artifactId}`)), "Couldn't load the artifact")
}

export async function getArtifactPreview(projectId: string, artifactId: string, versionId: string): Promise<ArtifactPreview> {
  return readSpaceData(
    await apiFetch(artifactsUrl(projectId, `/${artifactId}/versions/${versionId}/preview`)),
    "Couldn't load the preview"
  )
}

export function downloadArtifactVersion(projectId: string, artifactId: string, versionId: string, fallbackName: string): Promise<void> {
  return saveDownload(
    artifactsUrl(projectId, `/${artifactId}/versions/${versionId}/download`),
    fallbackName,
    "Couldn't download the artifact"
  )
}
