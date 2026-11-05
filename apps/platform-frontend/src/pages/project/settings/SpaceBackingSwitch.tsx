import { Button } from '@/components/button'
import {
  bringSpaceInAsApp,
  downloadLastAppData,
  ejectSpaceApp,
  getSpaceBackingOptions,
  type BringInAsApp,
} from '@/service/api/space-backing-api'
import type { Project, SpaceBackingOptions } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { BringInAppDialog } from './BringInAppDialog'
import { EjectAppDialog } from './EjectAppDialog'

function dateOf(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
}

/** Switching a space between git and App, for its maintainers; Files spaces don't switch. */
export function SpaceBackingSwitch({ project }: { project: Project }) {
  const navigate = useNavigate()
  const [options, setOptions] = useState<SpaceBackingOptions | null>(null)
  const [dialog, setDialog] = useState<'bring_in' | 'eject' | null>(null)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (project.backingKind === 'files') return
    let cancelled = false
    void getSpaceBackingOptions(project.id)
      .then((loaded) => !cancelled && setOptions(loaded))
      .catch(() => !cancelled && setOptions(null))
    return () => {
      cancelled = true
    }
  }, [project.id, project.backingKind])

  if (!options || project.backingKind === 'files') return null
  const isApp = project.backingKind === 'app'
  const lastCopy = !isApp && options.ejected?.bytes ? options.ejected : null
  if (!isApp && !options.appSpacesAvailable && !lastCopy) return null

  async function bringIn(request: BringInAsApp) {
    const broughtIn = await bringSpaceInAsApp(project.id, request)
    for (const warning of broughtIn.warnings) toast.warning(warning, { duration: Infinity })
    setDialog(null)
    if (broughtIn.contractTaskId) {
      toast.success("It's an App space now. The agent is making the repository fit the app contract.")
      navigate(`/spaces/${broughtIn.slug}/tasks/${broughtIn.contractTaskId}`)
    } else {
      toast.success("It's an App space now. The app goes live once its first release is built.")
      navigate(`/spaces/${broughtIn.slug}/app`)
    }
  }

  async function eject() {
    await ejectSpaceApp(project.id)
    setDialog(null)
    setOptions(await getSpaceBackingOptions(project.id))
    toast.success('The app is off for good, and this is a git space again.')
  }

  async function download() {
    setDownloading(true)
    try {
      await downloadLastAppData(project.id, project.slug)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't download the app's data")
    } finally {
      setDownloading(false)
    }
  }

  return (
    <>
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/50 p-6 dark:border-zinc-800 dark:bg-zinc-900/50">
        <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
          {isApp ? 'Stop hosting the app' : 'Make this an App space'}
        </h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {isApp
            ? 'For an app that outgrew Viberglass: the space becomes a git space on the same repository, and you get its data as a SQLite file.'
            : "Viberglass hosts the app in this space's repository, and people ask for changes to it here."}
        </p>
        {lastCopy && (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            This space hosted an app until {dateOf(lastCopy.ejectedAt)}. Its last data is kept until{' '}
            {dateOf(lastCopy.keptUntil)}.
          </p>
        )}
        <div className="mt-4 flex gap-3">
          {(isApp || options.appSpacesAvailable) && (
            <Button outline onClick={() => setDialog(isApp ? 'eject' : 'bring_in')}>
              {isApp ? 'Stop hosting the app' : 'Make this an App space'}
            </Button>
          )}
          {lastCopy && (
            <Button outline onClick={() => void download()} disabled={downloading}>
              {downloading ? 'Downloading…' : "Download the app's last data"}
            </Button>
          )}
        </div>
      </div>

      {dialog === 'bring_in' && (
        <BringInAppDialog project={project} options={options} onClose={() => setDialog(null)} onConfirm={bringIn} />
      )}
      {dialog === 'eject' && (
        <EjectAppDialog keepDays={options.keepDays} onClose={() => setDialog(null)} onConfirm={eject} />
      )}
    </>
  )
}
