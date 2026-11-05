import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Field, Label } from '@/components/fieldset'
import { Input } from '@/components/input'
import { Radio, RadioField, RadioGroup } from '@/components/radio'
import type { BringInAsApp } from '@/service/api/space-backing-api'
import { isAppStartFrom, type AppStartFrom, type Project, type SpaceBackingOptions } from '@viberglass/types'
import { useState } from 'react'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Confirms making a git space an App space: what happens, a new name when needed, and the data the app starts with. */
export function BringInAppDialog({
  project,
  options,
  onClose,
  onConfirm,
}: {
  project: Project
  options: SpaceBackingOptions
  onClose: () => void
  onConfirm: (request: BringInAsApp) => Promise<void>
}) {
  const lastCopy = options.ejected?.bytes ? options.ejected : null
  const [name, setName] = useState(options.nameFitsApp ? '' : project.name)
  const [startFrom, setStartFrom] = useState<AppStartFrom>(lastCopy ? 'last_copy' : 'none')
  const [file, setFile] = useState<File | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ready = (options.nameFitsApp || name.trim()) && (startFrom !== 'upload' || file)

  const confirm = async () => {
    setSaving(true)
    setError(null)
    try {
      await onConfirm({
        startFrom,
        ...(options.nameFitsApp ? {} : { name: name.trim() }),
        ...(startFrom === 'upload' && file ? { file } : {}),
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't make this space an App space")
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={() => !saving && onClose()} size="lg">
      <DialogTitle>Make this an App space</DialogTitle>
      <DialogDescription>
        Viberglass builds, runs and backs up the app in this space&apos;s repository. Tasks, members, schedules and the
        repository stay as they are.
      </DialogDescription>
      <DialogBody>
        <div className="space-y-6">
          <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--gray-11)]">
            <li>Changes go live when someone makes them live, which merges them into the repository.</li>
            <li>
              If the repository doesn&apos;t follow the app contract yet, a task asks the space&apos;s default agent to
              make it fit. The app has nothing to serve until that change is made live.
            </li>
            <li>Agents in this space follow the app contract from now on.</li>
            <li>
              Deleting the space later archives the repository on its code host. It stays there, read-only, and can be
              unarchived.
            </li>
          </ul>

          {!options.nameFitsApp && (
            <Field>
              <Label>New name for the space</Label>
              <Description>The app is served at an address made from it. {options.appNameRule}</Description>
              <Input value={name} onChange={(event) => setName(event.target.value)} disabled={saving} />
            </Field>
          )}

          <RadioGroup
            value={startFrom}
            onChange={(value) => isAppStartFrom(value) && setStartFrom(value)}
            aria-label="What data the app starts with"
            disabled={saving}
          >
            {lastCopy && (
              <RadioField>
                <Radio value="last_copy" />
                <Label>Its data from before</Label>
                <Description>
                  The copy kept when the space stopped hosting its app on{' '}
                  {new Date(lastCopy.ejectedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.
                </Description>
              </RadioField>
            )}
            <RadioField>
              <Radio value="upload" />
              <Label>A SQLite file</Label>
              <Description>Upload the database the app should start with.</Description>
            </RadioField>
            <RadioField>
              <Radio value="none" />
              <Label>No data</Label>
              <Description>The app starts empty.</Description>
            </RadioField>
          </RadioGroup>

          {startFrom === 'upload' && (
            <Field>
              <Label>SQLite file</Label>
              <input
                type="file"
                accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3"
                aria-label="SQLite file"
                className="mt-2 block text-sm text-[var(--gray-11)]"
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                disabled={saving}
              />
              {file && <Description>{`${file.name}, ${formatBytes(file.size)}`}</Description>}
            </Field>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        </div>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button color="brand" onClick={() => void confirm()} disabled={saving || !ready}>
          {saving ? 'Switching…' : 'Make it an App space'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
