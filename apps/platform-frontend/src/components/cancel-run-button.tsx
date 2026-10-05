import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { useState } from 'react'

/** Runs this long are worth a second thought before stopping: say how long it's been going. */
const LONG_RUN_MS = 30 * 60_000

/** "2h 5m", "45m". */
export function runningFor(since: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.floor((now - new Date(since).getTime()) / 60_000))
  const hours = Math.floor(minutes / 60)
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`
}

/**
 * A red "Cancel" button that asks for confirmation first. Cancelling stops the
 * agent; the transcript and anything produced so far are kept.
 */
export function CancelRunButton({
  label,
  isCancelling,
  onConfirm,
  startedAt,
}: {
  label: string
  isCancelling: boolean
  onConfirm: () => void
  /** When the run started; a long one says how long it's been going. */
  startedAt?: string | null
}) {
  const [open, setOpen] = useState(false)
  const long = startedAt ? Date.now() - new Date(startedAt).getTime() >= LONG_RUN_MS : false

  return (
    <>
      <Button color="red" disabled={isCancelling} onClick={() => setOpen(true)}>
        {isCancelling ? 'Cancelling…' : label}
      </Button>
      <Alert open={open} onClose={setOpen}>
        <AlertTitle>{long && startedAt ? `It's been going for ${runningFor(startedAt)}. Stop it?` : 'Stop the agent?'}</AlertTitle>
        <AlertDescription>
          The agent stops working right away. The transcript and anything it has produced so far are kept: documents it
          wrote become a version, and code changes a work-in-progress commit on the task&apos;s branch. You can start a
          new run later.
        </AlertDescription>
        <AlertActions>
          <Button outline onClick={() => setOpen(false)}>
            Keep running
          </Button>
          <Button
            color="red"
            onClick={() => {
              setOpen(false)
              onConfirm()
            }}
          >
            Stop agent
          </Button>
        </AlertActions>
      </Alert>
    </>
  )
}
