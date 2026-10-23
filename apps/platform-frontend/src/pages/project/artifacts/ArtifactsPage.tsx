import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { ListPanel, ListRow, MetaLine } from '@/components/list-panel'
import { SpacePageBar } from '@/components/space-page-bar'
import { PageMeta } from '@/components/page-meta'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { useProject } from '@/context/project-context'
import { artifactPath, formatLabel } from '@/lib/artifacts'
import { taskPath } from '@/lib/taskPath'
import { getArtifacts } from '@/service/api/artifact-api'
import { ReaderIcon } from '@radix-ui/react-icons'
import type { ArtifactSummary } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'

/** What a Files space's tasks have delivered, newest first. */
export function ArtifactsPage() {
  const { project, isLoading } = useProject()
  const [artifacts, setArtifacts] = useState<ArtifactSummary[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const projectId = project?.id

  const load = useCallback(async () => {
    if (!projectId) return
    try {
      setArtifacts(await getArtifacts(projectId))
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load the artifacts")
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  if (isLoading) return <p className="py-20 text-center text-sm text-[var(--gray-10)]">Loading…</p>
  if (!project) return null
  if (project.backingKind !== 'files') return <Navigate to={`/spaces/${project.slug}`} replace />

  const sorted = [...(artifacts ?? [])].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <>
      <PageMeta title={`${project.name} | Artifacts`} />
      <SpacePageBar
        description="The documents, presentations and other deliverables this space’s tasks have produced."
      />
      {loadError ? (
        <div className="space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{loadError}</p>
          <Button outline onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !artifacts ? (
        <p className="text-sm text-[var(--gray-10)]">Loading the artifacts…</p>
      ) : sorted.length === 0 ? (
        <EmptyState
          icon={<ReaderIcon className="size-6" />}
          title="No artifacts yet"
          description="Open a task and ask the agent to create an artifact. Each version it makes shows here, ready to preview and download."
        />
      ) : (
        <ListPanel aria-label="Artifacts">
          {sorted.map((artifact) => (
            <ListRow
              key={artifact.id}
              title={artifact.title}
              href={artifactPath(project.slug, artifact.id)}
              action={
                artifact.taskId && (
                  <Link
                    href={taskPath(project.slug, { id: artifact.taskId, key: artifact.taskKey ?? undefined })}
                    className="text-xs text-[var(--gray-11)] underline decoration-[var(--gray-7)] underline-offset-2"
                  >
                    {artifact.taskKey ?? 'Task'}
                  </Link>
                )
              }
              meta={
                <MetaLine
                  parts={[
                    artifact.currentVersion ? `Version ${artifact.currentVersion.number}` : 'No version kept',
                    artifact.currentVersion ? formatLabel(artifact.currentVersion.format) : null,
                    <>
                      updated <Timestamp date={artifact.updatedAt} />
                    </>,
                  ]}
                />
              }
            />
          ))}
        </ListPanel>
      )}
    </>
  )
}
