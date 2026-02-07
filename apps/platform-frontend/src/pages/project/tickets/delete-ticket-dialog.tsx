import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import type { Ticket } from '@viberglass/types'
import { useState } from 'react'

interface DeleteTicketDialogProps {
  ticket: Ticket
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
}

export function DeleteTicketDialog({ ticket, open, onClose, onConfirm }: DeleteTicketDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    try {
      await onConfirm()
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Delete Ticket</DialogTitle>
      <DialogDescription>Are you sure you want to delete this ticket? This action cannot be undone.</DialogDescription>

      <DialogBody>
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-white/10 dark:bg-zinc-900">
          <p className="font-medium text-zinc-900 dark:text-white">{ticket.title}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{ticket.description}</p>
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isDeleting}>
          Cancel
        </Button>
        <Button color="red" onClick={handleConfirm} disabled={isDeleting}>
          {isDeleting ? 'Deleting...' : 'Delete Ticket'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
