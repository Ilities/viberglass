import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { PageMeta } from '@/components/page-meta'
import { SpacePageBar } from '@/components/space-page-bar'
import { Timestamp } from '@/components/timestamp'
import { useProject } from '@/context/project-context'
import { getApp, turnAppOff, turnAppOn } from '@/service/api/app-api'
import { RocketIcon } from '@radix-ui/react-icons'
import type { AppRunState, AppView } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AppLogs } from './app-logs'
import { ReleasesTable, shortSha } from './releases-table'

const WHILE_BUSY_MS = 5000

const STATE_LABELS: Record<AppRunState, string> = {
  running: 'Running',
  starting: 'Starting',
  stopping: 'Stopping',
  off: 'Off',
  failed: 'Not running',
}

/** An App space's app: whether it's on, the release it serves and every release built. */
export function AppPage() {
  const { project, isLoading } = useProject()
  const [app, setApp] = useState<AppView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [switching, setSwitching] = useState(false)
  const projectId = project?.id
  const isApp = project?.backingKind === 'app'

  const load = useCallback(async () => {
    if (!projectId || !isApp) return
    try {
      setApp(await getApp(projectId))
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Couldn't load the app")
    }
  }, [projectId, isApp])

  useEffect(() => {
    void load()
  }, [load])

  const busy = Boolean(app && (app.state === 'starting' || app.state === 'stopping' || awaitingChange(app)))
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => void load(), WHILE_BUSY_MS)
    return () => clearInterval(timer)
  }, [busy, load])

  if (isLoading) return <p className="py-20 text-center text-sm text-[var(--gray-10)]">Loading…</p>
  if (!project) return null
  if (!isApp) return <Navigate to={`/spaces/${project.slug}`} replace />

  const canMaintain = Boolean(project.viewerAccess?.canMaintain)
  const turning = app?.state === 'starting' || app?.state === 'stopping'
  const toggle = async () => {
    if (!app) return
    setSwitching(true)
    try {
      setApp(app.power === 'on' ? await turnAppOff(project.id) : await turnAppOn(project.id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't change whether the app is on")
    } finally {
      setSwitching(false)
    }
  }

  return (
    <>
      <PageMeta title={`${project.name} | App`} />
      <SpacePageBar
        description={app ? <AppSummary app={app} /> : 'The app this space builds.'}
        actions={
          canMaintain &&
          app &&
          (app.currentRelease || app.power === 'on' || app.releases.some((release) => release.status === 'ready')) && (
            <Button color="brand" onClick={() => void toggle()} disabled={switching || turning}>
              {app.power === 'on' ? 'Turn off' : 'Turn on'}
            </Button>
          )
        }
      />

      {app?.statusMessage && (
        <p role="status" className="mb-4 rounded-md bg-[var(--gray-3)] px-4 py-3 text-sm text-[var(--gray-11)]">
          {app.statusMessage}
        </p>
      )}

      {loadError ? (
        <div className="space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{loadError}</p>
          <Button outline onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : !app ? (
        <p className="text-sm text-[var(--gray-10)]">Loading the app…</p>
      ) : app.releases.length === 0 ? (
        <EmptyState
          icon={<RocketIcon className="size-6" />}
          title="No releases yet"
          description="The app appears here once the first change to it is made live."
        />
      ) : (
        <ReleasesTable releases={app.releases} currentId={app.currentRelease?.id ?? null} />
      )}

      {canMaintain && app && app.releases.length > 0 && <AppLogs projectId={project.id} />}
    </>
  )
}

/** A release is building, or the app was turned on or off and hasn't started doing so yet. */
function awaitingChange(app: AppView): boolean {
  if (app.releases.some((release) => release.status === 'building')) return true
  if (app.power === 'off') return app.state !== 'off'
  return app.state === 'off' && app.releases.some((release) => release.status === 'ready' && !release.liveFailure)
}

function AppSummary({ app }: { app: AppView }) {
  const release = app.currentRelease
  return (
    <span>
      {STATE_LABELS[app.state]}
      {release && (
        <>
          {' · '}release <span className="font-mono">{shortSha(release.commitSha)}</span>
          {release.wentLiveAt && (
            <>
              , live since <Timestamp date={release.wentLiveAt} />
            </>
          )}
        </>
      )}
    </span>
  )
}
