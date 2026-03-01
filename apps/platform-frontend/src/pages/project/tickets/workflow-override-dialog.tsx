import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { overrideTicketWorkflowToExecution } from '@/service/api/ticket-api'
import type { Ticket } from '@viberglass/types'
import { useMemo, useState } from 'react'

interface WorkflowOverrideDialogProps {
  ticket: Ticket
  open: boolean
  onClose: () => void
  onSuccess: (ticket: Ticket) => void
}

export function WorkflowOverrideDialog({
  ticket,
  open,
  onClose,
  onSuccess,
}: WorkflowOverrideDialogProps) {
  const [reason, setReason] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const trimmedReason = useMemo(() => reason.trim(), [reason])

  async function handleConfirm() {
    if (!trimmedReason) {
      return
    }

    setIsSubmitting(true)
    try {
      const updatedTicket = await overrideTicketWorkflowToExecution(ticket.id, trimmedReason)
      onSuccess(updatedTicket)
      setReason('')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleClose() {
    if (isSubmitting) {
      return
    }

    setReason('')
    onClose()
  }

  return (
    <Dialog
      open={open}
      onClose={(nextOpen) => {
        if (!nextOpen) {
          handleClose()
        }
      }}
      size="lg"
    >
      <DialogTitle>Execute without Research/Planning</DialogTitle>
      <DialogDescription>
        This explicitly bypasses the planning approval gate and moves the ticket into execution.
      </DialogDescription>

      <DialogBody>
        <div className="space-y-4">
          <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-900">
            <p className="font-medium text-zinc-900 dark:text-white">{ticket.title}</p>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Record why this ticket should skip the normal research and planning path.
            </p>
          </div>

          <div>
            <label
              htmlFor="workflow-override-reason"
              className="mb-2 block text-sm font-medium text-zinc-900 dark:text-white"
            >
              Override Reason
            </label>
            <textarea
              id="workflow-override-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={5}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              placeholder="Explain why execution should proceed without approved research/planning..."
            />
            <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              This reason is stored on the ticket as part of the workflow override audit trail.
            </p>
          </div>
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button color="red" onClick={() => void handleConfirm()} disabled={isSubmitting || !trimmedReason}>
          {isSubmitting ? 'Overriding...' : 'Override to Execution'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
