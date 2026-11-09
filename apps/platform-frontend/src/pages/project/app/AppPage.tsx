import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { PageMeta } from '@/components/page-meta'
import { SpacePageBar } from '@/components/space-page-bar'
import { Timestamp } from '@/components/timestamp'
import { useProject } from '@/context/project-context'
import { getApp, rollBackApp, turnAppOff, turnAppOn } from '@/service/api/app-api'
import { RocketIcon } from '@radix-ui/react-icons'
import type { AppRelease, AppRunState, AppSettingsView, AppView } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { AppAccess } from './app-access'
import { AppLogs } from './app-logs'
import { AppSettings } from './app-settings'
import { BackUpButton } from './back-up-button'
import { NightScheduleHint } from './night-schedule-hint'
import { ReleasesTable, shortSha } from './releases-table'
import { RollbackDialog } from './rollback-dialog'

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
  const [restoring, setRestoring] = useState<AppRelease | null>(null)
  const [missingSettings, setMissingSettings] = useState<string[]>([])
  const settingsLoaded = useCallback((view: AppSettingsView) => setMissingSettings(view.missing), [])
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
  const canOpen = app?.state === 'running'
  const canToggle =
    canMaintain &&
    Boolean(
      app && (app.currentRelease || app.power === 'on' || app.releases.some((release) => release.status === 'ready'))
    )
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

  const rollBack = async (release: AppRelease, withData: boolean) => {
    try {
      setApp(await rollBackApp(project.id, release.id, withData))
      setRestoring(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't roll the app back")
    }
  }

  return (
    <>
      <PageMeta title={`${project.name} | App`} />
      <SpacePageBar
        description={app ? <AppSummary app={app} /> : 'The app this space builds.'}
        actions={
          app && (
            <>
              {canOpen && app.url && (
                <Button color="brand" href={app.url} target="_blank" rel="noopener">
                  Open app
                </Button>
              )}
              {canToggle && (
                <Button
                  {...(canOpen ? { outline: true } : { color: 'brand' })}
                  onClick={() => void toggle()}
                  disabled={switching || turning}
                >
                  {app.power === 'on' ? 'Turn off' : 'Turn on'}
                </Button>
              )}
              {canMaintain && app.currentRelease && (
                <BackUpButton projectId={project.id} app={app} onStarted={setApp} />
              )}
            </>
          )
        }
      />

      {app && <RollbackNotice app={app} />}

      {canMaintain && app && app.releases.length > 0 && <NightScheduleHint projectId={project.id} />}

      {missingSettings.length > 0 && (
        <p role="status" className="mb-4 rounded-md bg-[var(--amber-3)] px-4 py-3 text-sm text-[var(--amber-11)]">
          The app asks for {missingSettings.length === 1 ? 'a setting' : 'settings'} that{' '}
          {missingSettings.length === 1 ? "isn't" : "aren't"} set: {missingSettings.join(', ')}. Set{' '}
          {missingSettings.length === 1 ? 'it' : 'them'} under Settings below.
        </p>
      )}

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
        <ReleasesTable
          releases={app.releases}
          current={app.currentRelease}
          onRestore={canMaintain && !app.rollback && !turning ? setRestoring : undefined}
        />
      )}

      {app && restoring && (
        <RollbackDialog
          release={restoring}
          current={app.currentRelease}
          dataPointAt={app.dataPoints[restoring.id] ?? null}
          onClose={() => setRestoring(null)}
          onConfirm={(withData) => rollBack(restoring, withData)}
        />
      )}

      {canMaintain && <AppSettings projectId={project.id} onLoad={settingsLoaded} />}
      {canMaintain && <AppAccess projectId={project.id} />}
      {canMaintain && app && app.releases.length > 0 && <AppLogs projectId={project.id} />}
    </>
  )
}

/** A release is building, or the app was turned on or off and hasn't started doing so yet. */
function awaitingChange(app: AppView): boolean {
  if (app.rollback || app.backupDue || app.dataRestoreDue) return true
  if (app.releases.some((release) => release.status === 'building')) return true
  if (app.power === 'off') return app.state !== 'off'
  return app.state === 'off' && app.releases.some((release) => release.status === 'ready' && !release.liveFailure)
}

/** A rollback, restore or backup under way, or the newer code a rollback took out, which the next change made live brings back. */
function RollbackNotice({ app }: { app: AppView }) {
  const pending = app.rollback && app.releases.find((release) => release.id === app.rollback?.releaseId)
  const current = app.currentRelease
  const setAside =
    current && app.releases.some((release) => release.rolledBackAt && release.createdAt > current.createdAt)
  const message = pending
    ? `Switching to release ${shortSha(pending.commitSha)}${app.rollback?.withData ? ' with its data' : ''}…`
    : (dataWorkUnderWay(app) ??
      (setAside
        ? 'Newer releases were rolled back. Their code is still in the repository, so the next change made live brings it back.'
        : null))
  if (!message) return null
  return (
    <p role="status" className="mb-4 rounded-md bg-[var(--gray-3)] px-4 py-3 text-sm text-[var(--gray-11)]">
      {message}
    </p>
  )
}

function dataWorkUnderWay(app: AppView): string | null {
  if (app.dataRestoreDue) return "Restoring the app's data from a backup…"
  if (app.backupDue) return "Backing up the app's data…"
  return null
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
