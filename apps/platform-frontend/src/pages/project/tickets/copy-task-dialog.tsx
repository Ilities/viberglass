import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import { taskPath } from '@/lib/taskPath'
import { getProjects, type Project } from '@/service/api/project-api'
import { copyTask } from '@/service/api/ticket-api'
import type { Ticket } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'

interface CopyTaskDialogProps {
  ticket: Ticket
  open: boolean
  onClose: () => void
  /** Called once the copy is made, so the thread shows the note it got. */
  onCopied: () => void
}

/** Copies the task into another space, for work that needs that space's repository. */
export function CopyTaskDialog({ ticket, open, onClose, onCopied }: CopyTaskDialogProps) {
  const navigate = useNavigate()
  const [spaces, setSpaces] = useState<Project[] | null>(null)
  const [spaceId, setSpaceId] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setSpaceId('')
    getProjects(100)
      .then((all) => setSpaces(all.filter((space) => space.id !== ticket.projectId && !space.archivedAt)))
      .catch(() => setSpaces([]))
  }, [open, ticket.projectId])

  async function copy() {
    const space = spaces?.find((candidate) => candidate.id === spaceId)
    if (!space) return
    setBusy(true)
    try {
      const copied = await copyTask(ticket.id, space.id)
      onCopied()
      onClose()
      toast.success(`Copied to ${space.name}`, {
        action: { label: 'Open', onClick: () => navigate(taskPath(space.slug, copied)) },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to copy the task')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Copy to another space</DialogTitle>
      <DialogDescription>
        A new task with the same title and description, for work that needs the other space&apos;s repository. Both threads
        link to each other; the plan and runs stay here.
      </DialogDescription>
      <DialogBody>
        <Label>Space</Label>
        <Select aria-label="Space" value={spaceId} placeholder={spaces ? 'Choose a space…' : 'Loading…'} onChange={setSpaceId} disabled={!spaces}>
          {(spaces ?? []).map((space) => (
            <option key={space.id} value={space.id}>
              {space.name}
            </option>
          ))}
        </Select>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button color="brand" onClick={() => void copy()} disabled={busy || !spaceId}>
          {busy ? 'Copying…' : 'Copy'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
