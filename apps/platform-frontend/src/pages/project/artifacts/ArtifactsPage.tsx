import { EmptyState } from '@/components/empty-state'
import { PageMeta } from '@/components/page-meta'
import { SpacePageBar } from '@/components/space-page-bar'
import { useProject } from '@/context/project-context'
import { OutputsBrowser } from '@/pages/outputs/outputs-browser'
import { ReaderIcon } from '@radix-ui/react-icons'
import { Navigate } from 'react-router-dom'

/** What a Files space's tasks have delivered, as covers, newest first. */
export function ArtifactsPage() {
  const { project, isLoading } = useProject()

  if (isLoading) return <p className="py-20 text-center text-sm text-[var(--gray-10)]">Loading…</p>
  if (!project) return null
  if (project.backingKind !== 'files') return <Navigate to={`/spaces/${project.slug}`} replace />

  return (
    <>
      <PageMeta title={`${project.name} | Artifacts`} />
      <OutputsBrowser
        spaceId={project.id}
        header={({ toolbar }) => (
          <SpacePageBar description="The documents, presentations and other deliverables this space’s tasks have produced." actions={toolbar} />
        )}
        empty={
          <EmptyState
            icon={<ReaderIcon className="size-6" />}
            title="No artifacts yet"
            description="Open a task and ask the agent to create an artifact. Each version it makes shows here, ready to preview and download."
          />
        }
      />
    </>
  )
}
