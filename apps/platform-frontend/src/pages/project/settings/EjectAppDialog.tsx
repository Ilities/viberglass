import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { useState } from 'react'

/** Confirms turning an App space back into a git space, saying what goes and what's kept. */
export function EjectAppDialog({
  keepDays,
  onClose,
  onConfirm,
}: {
  /** How long the last copy of the data is kept. */
  keepDays: number
  onClose: () => void
  onConfirm: () => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await onConfirm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't stop hosting the app")
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={() => !saving && onClose()} size="lg">
      <DialogTitle>Stop hosting the app</DialogTitle>
      <DialogDescription>
        The space carries on as a git space on the same repository, with its tasks, members and history.
      </DialogDescription>
      <DialogBody>
        <div className="space-y-4 text-sm text-[var(--gray-11)]">
          <ul className="list-disc space-y-1 pl-5">
            <li>The app stops for good, and nobody can open it at its address.</li>
            <li>
              Its previews, access list, settings and secrets, and the schedules that turn it on and off are removed.
            </li>
            <li>People who could only open this app keep their accounts, with nothing to open.</li>
          </ul>
          <p>
            A last copy of its data is kept for {keepDays} days. You can download it as a SQLite file here, or make this
            an App space again and start from it.
          </p>
          {error && <p className="text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button color="red" onClick={() => void confirm()} disabled={saving}>
          {saving ? 'Stopping…' : 'Stop hosting the app'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
