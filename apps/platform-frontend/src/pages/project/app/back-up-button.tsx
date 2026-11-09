import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { backUpApp } from '@/service/api/app-api'
import type { AppView } from '@viberglass/types'
import { useState } from 'react'
import { toast } from 'sonner'

/** Takes a copy of the app's data now, for a schedule to restore. */
export function BackUpButton({
  projectId,
  app,
  onStarted,
}: {
  projectId: string
  app: AppView
  onStarted: (app: AppView) => void
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const running = app.state === 'running'

  const backUp = async () => {
    setSaving(true)
    try {
      onStarted(await backUpApp(projectId))
      setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't back up the app's data")
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button
        outline
        onClick={() => setOpen(true)}
        disabled={app.backupDue || app.state === 'starting' || app.state === 'stopping'}
      >
        Back up now
      </Button>
      <Alert open={open} onClose={(next) => !saving && setOpen(next)}>
        <AlertTitle>Back up the app's data?</AlertTitle>
        <AlertDescription>
          {running
            ? 'The app stops for a moment while its data is copied, then starts again.'
            : 'The app stays off while its data is copied.'}{' '}
          A schedule can restore the app's data to this backup.
        </AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </Button>
          <Button color="brand" onClick={() => void backUp()} disabled={saving}>
            Back up
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
