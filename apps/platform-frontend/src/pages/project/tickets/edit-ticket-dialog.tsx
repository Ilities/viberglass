import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Select } from '@/components/select'
import { Textarea } from '@/components/textarea'
import type { Severity, Ticket } from '@viberglass/types'
import { useEffect, useState } from 'react'

export interface EditTicketValues {
  title: string
  description: string
  severity: Severity
  category: string
}

function isSeverity(value: string): value is Severity {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
}

interface EditTicketDialogProps {
  ticket: Ticket
  open: boolean
  onClose: () => void
  onSave: (updates: EditTicketValues) => Promise<void>
}

export function EditTicketDialog({ ticket, open, onClose, onSave }: EditTicketDialogProps) {
  const [title, setTitle] = useState(ticket.title)
  const [description, setDescription] = useState(ticket.description)
  const [severity, setSeverity] = useState<Severity>(ticket.severity)
  const [category, setCategory] = useState(ticket.category)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    setTitle(ticket.title)
    setDescription(ticket.description)
    setSeverity(ticket.severity)
    setCategory(ticket.category)
  }, [open, ticket])

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await onSave({
        title,
        description,
        severity,
        category,
      })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onClose={onClose} size="2xl">
      <DialogTitle>Edit Task</DialogTitle>
      <DialogDescription>Update the task details below.</DialogDescription>

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

          <div className="grid grid-cols-2 gap-4">
            <Field>
              <Label>Severity</Label>
              <Select
                value={severity}
                onChange={(value) => {
                  if (isSeverity(value)) {
                    setSeverity(value)
                  }
                }}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
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
        <Button outline onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
