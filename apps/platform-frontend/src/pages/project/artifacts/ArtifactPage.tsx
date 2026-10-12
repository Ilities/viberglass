import { Button } from '@/components/button'
import { Link } from '@/components/link'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { useProject } from '@/context/project-context'
import { usePersonName } from '@/hooks/usePeople'
import { artifactPath, formatBytes, formatLabel } from '@/lib/artifacts'
import { formatTimestamp } from '@/lib/formatters'
import { taskPath } from '@/lib/taskPath'
import { downloadArtifactVersion, getArtifact } from '@/service/api/artifact-api'
import type { ArtifactDetail, ArtifactVersionSummary } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArtifactPreviewView } from './artifact-preview'

/** "Version 3 · 12 Oct · by a run", for the version picker. */
export function versionLabel(version: ArtifactVersionSummary, personName: (id: string | null) => string | null): string {
  const by = version.producedBy.kind === 'run' ? 'by an agent' : `edited by ${personName(version.producedBy.userId) ?? 'someone'}`
  const expired = version.status === 'expired' ? ' · no longer kept' : ''
  return `Version ${version.number} · ${formatTimestamp(version.createdAt)} · ${by}${expired}`
}

/** One artifact: a version to preview and download, and the others to pick from. */
export function ArtifactPage() {
  const { project, isLoading } = useProject()
  const { artifactId } = useParams<{ artifactId: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const personName = usePersonName()
  const [artifact, setArtifact] = useState<ArtifactDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const projectId = project?.id

  const load = useCallback(async () => {
    if (!projectId || !artifactId) return
    try {
      setArtifact(await getArtifact(projectId, artifactId))
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load the artifact")
    }
  }, [projectId, artifactId])

  useEffect(() => {
    void load()
  }, [load])

  if (isLoading) return <p className="py-20 text-center text-sm text-[var(--gray-10)]">Loading…</p>
  if (!project) return null
  if (project.backingKind !== 'files') return <Navigate to={`/spaces/${project.slug}`} replace />
  if (loadError) {
    return (
      <div className="space-y-3 py-10 text-sm">
        <p className="text-red-700 dark:text-red-400">{loadError}</p>
        <Button outline href={`/spaces/${project.slug}/artifacts`}>
          All artifacts
        </Button>
      </div>
    )
  }
  if (!artifact) return <p className="py-20 text-center text-sm text-[var(--gray-10)]">Loading the artifact…</p>

  const requested = searchParams.get('version')
  const version =
    artifact.versions.find((candidate) => candidate.id === requested) ?? artifact.currentVersion ?? artifact.versions[0] ?? null
  const isCurrent = version !== null && version.id === artifact.currentVersion?.id
  const download = () => {
    if (!version) return
    void downloadArtifactVersion(project.id, artifact.id, version.id, version.entrypoint.split('/').pop() ?? artifact.title).catch(
      (error: unknown) => toast.error(error instanceof Error ? error.message : "Couldn't download the artifact")
    )
  }

  return (
    <>
      <PageMeta title={`${artifact.title} | Artifacts`} />
      <PageHeader
        eyebrow={
          <span>
            <Link href={`/spaces/${project.slug}/artifacts`} className="hover:underline">
              Artifacts
            </Link>
            {artifact.taskId && (
              <>
                {' · '}
                <Link
                  href={taskPath(project.slug, { id: artifact.taskId, key: artifact.taskKey ?? undefined })}
                  className="hover:underline"
                >
                  {artifact.taskKey ?? 'Task'}
                </Link>
              </>
            )}
          </span>
        }
        title={artifact.title}
        description={
          version
            ? [
                formatLabel(version.format),
                version.entrypoint,
                `${version.fileCount} file${version.fileCount === 1 ? '' : 's'}`,
                formatBytes(version.totalBytes),
                isCurrent ? 'current version' : null,
              ]
                .filter(Boolean)
                .join(' · ')
            : 'No version is kept.'
        }
        actions={
          version &&
          version.status === 'available' && (
            <Button outline onClick={download}>
              Download
            </Button>
          )
        }
      />

      {artifact.versions.length > 1 && version && (
        <div className="mb-4 max-w-md">
          <Select
            aria-label="Version"
            value={version.id}
            onChange={(id) => navigate(artifactPath(project.slug, artifact.id, id), { replace: true })}
          >
            {artifact.versions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {versionLabel(candidate, personName)}
              </option>
            ))}
          </Select>
        </div>
      )}

      <section
        aria-label="Preview"
        className="rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] p-5 max-sm:px-3"
      >
        {version ? (
          <ArtifactPreviewView
            projectId={project.id}
            artifactId={artifact.id}
            versionId={version.id}
            title={artifact.title}
            currentVersionHref={
              artifact.currentVersion && !isCurrent ? artifactPath(project.slug, artifact.id, artifact.currentVersion.id) : null
            }
            onDownload={download}
          />
        ) : (
          <p className="py-10 text-center text-sm text-[var(--gray-10)]">This artifact has no version kept any more.</p>
        )}
      </section>
    </>
  )
}
