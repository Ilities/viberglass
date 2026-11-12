import { Button } from '@/components/button'
import { Dialog, DialogActions, DialogBody, DialogDescription, DialogTitle } from '@/components/dialog'
import { Description, Label } from '@/components/fieldset'
import { Radio, RadioField, RadioGroup } from '@/components/radio'
import type { AppReleaseView } from '@viberglass/types'
import { useState } from 'react'
import { isOlder, shortSha } from './releases-table'

const HOUR_MS = 60 * 60_000

/** What restoring data from `since` throws away, in words. */
export function changesLost(since: string, now: Date): string {
  const hours = Math.floor((now.getTime() - new Date(since).getTime()) / HOUR_MS)
  if (hours < 1) return 'Changes made in the last hour will be lost.'
  return `${hours} ${hours === 1 ? 'hour' : 'hours'} of changes will be lost.`
}

export function RollbackDialog({
  release,
  current,
  dataPointAt,
  onClose,
  onConfirm,
}: {
  release: AppReleaseView
  current: AppReleaseView | null
  /** When the release's data is from; null when there's no copy of it. */
  dataPointAt: string | null
  onClose: () => void
  onConfirm: (withData: boolean) => Promise<void>
}) {
  const [choice, setChoice] = useState<'code' | 'data'>('code')
  const [saving, setSaving] = useState(false)
  const back = isOlder(release, current)
  const sha = shortSha(release.commitSha)
  const confirm = async () => {
    setSaving(true)
    try {
      await onConfirm(choice === 'data')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={() => !saving && onClose()} size="lg">
      <DialogTitle>{back ? `Roll back to release ${sha}` : `Make release ${sha} live`}</DialogTitle>
      <DialogDescription>
        The app stops for a moment while it switches. If release {sha} doesn't start, the current release serves again with today's data.
      </DialogDescription>
      <DialogBody>
        <div className="space-y-5">
          <RadioGroup value={choice} onChange={(value) => setChoice(value === 'data' ? 'data' : 'code')} aria-label="What goes back" disabled={saving}>
            <RadioField>
              <Radio value="code" />
              <Label>Code only</Label>
              <Description>Keep today's data.</Description>
            </RadioField>
            <RadioField disabled={!dataPointAt}>
              <Radio value="data" />
              <Label>Code and data</Label>
              <Description>
                {dataPointAt ? (
                  <>
                    Bring back the data as it was at{' '}
                    {new Date(dataPointAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.{' '}
                    {changesLost(dataPointAt, new Date())}
                  </>
                ) : (
                  "There's no copy of this release's data."
                )}
              </Description>
            </RadioField>
          </RadioGroup>
          {back && (
            <p className="text-sm text-[var(--gray-11)]">
              The newer code stays in the repository, so the next change made live brings it back.
            </p>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button outline onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button color="brand" onClick={() => void confirm()} disabled={saving}>
          {saving ? 'Switching…' : back ? 'Roll back' : 'Make live'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
