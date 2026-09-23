import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/alert'
import { Button } from '@/components/button'
import { useState } from 'react'

/**
 * A red "Cancel" button that asks for confirmation first. Cancelling stops the
 * agent; the transcript and anything produced so far are kept.
 */
export function CancelRunButton({
  label,
  isCancelling,
  onConfirm,
}: {
  label: string
  isCancelling: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button color="red" disabled={isCancelling} onClick={() => setOpen(true)}>
        {isCancelling ? 'Cancelling…' : label}
      </Button>
      <Alert open={open} onClose={setOpen}>
        <AlertTitle>Stop the agent?</AlertTitle>
        <AlertDescription>
          The agent stops working right away. The transcript and anything it has produced so far are kept, and you can
          start a new run later.
        </AlertDescription>
        <AlertActions>
          <Button plain onClick={() => setOpen(false)}>
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
