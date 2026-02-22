import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import type { Ticket, UpdateTicketRequest, Severity } from '@viberglass/types'
import { useState } from 'react'

interface EditTicketDialogProps {
  ticket: Ticket
  open: boolean
  onClose: () => void
  onSave: (updates: UpdateTicketRequest) => Promise<void>
}

type ManualTicketStatus = 'open' | 'in_progress' | 'resolved'

function getTicketStatus(ticket: Ticket): ManualTicketStatus {
  if (ticket.autoFixStatus === 'in_progress') return 'in_progress'
  if (ticket.autoFixStatus === 'completed') return 'resolved'
  if (ticket.autoFixStatus === 'pending' || ticket.autoFixStatus === 'failed') return 'open'
  if (ticket.externalTicketId) return 'resolved'
  return 'open'
}

function getAutoFixStatusForTicketStatus(status: ManualTicketStatus): Ticket['autoFixStatus'] {
  if (status === 'resolved') return 'completed'
  if (status === 'in_progress') return 'in_progress'
  return 'pending'
}

function parseSeverity(value: string): Severity {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'critical') {
    return value
  }
  return 'low'
}

function parseManualTicketStatus(value: string): ManualTicketStatus {
  if (value === 'open' || value === 'in_progress' || value === 'resolved') {
    return value
  }
  return 'open'
}

export function EditTicketDialog({ ticket, open, onClose, onSave }: EditTicketDialogProps) {
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [severity, setSeverity] = useState<Severity>(ticket.severity)
  const [category, setCategory] = useState(ticket.category)
  const [status, setStatus] = useState<ManualTicketStatus>(getTicketStatus(ticket))
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({
        title,
        description,
        severity,
        category,
        autoFixStatus: getAutoFixStatusForTicketStatus(status),
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Edit Ticket</DialogTitle>
      <DialogDescription>Update the ticket details below.</DialogDescription>

      <DialogBody>
        <div className="space-y-6">
          <Field>
            <Label>Title</Label>
            <Input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field>
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={6} />
          </Field>

          <div className="grid grid-cols-3 gap-4">
            <Field>
              <Label>Severity</Label>
              <Select value={severity} onChange={(value) => setSeverity(parseSeverity(value))}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </Select>
            </Field>

            <Field>
              <Label>Status</Label>
              <Select value={status} onChange={(value) => setStatus(parseManualTicketStatus(value))}>
                <option value="open">Open</option>
                <option value="in_progress">In Progress</option>
                <option value="resolved">Resolved</option>
              </Select>
            </Field>

            <Field>
              <Label>Category</Label>
              <Input type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
            </Field>
          </div>
        </div>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
