import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { AppDataBackup, AppDataBackupReason } from '@viberglass/types'
import { shortSha } from '../app/releases-table'

const REASONS: Record<AppDataBackupReason, string> = {
  manual: 'backed up by hand',
  release: 'before a new release went live',
  rollback: 'before a rollback',
  archive: 'when the space was archived',
  eject: 'when hosting stopped',
}

/** "9 Nov 2026, 11:00 · release abc1234 · backed up by hand" */
export function backupLabel(backup: AppDataBackup): string {
  const takenAt = new Date(backup.takenAt).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const release = backup.fromRelease ? ` · release ${shortSha(backup.fromRelease.commitSha)}` : ''
  return `${takenAt}${release} · ${REASONS[backup.reason]}`
}

export function RestoreBackupField({
  backups,
  value,
  onChange,
  disabled,
}: {
  backups: AppDataBackup[]
  value: string
  onChange: (backupId: string) => void
  disabled?: boolean
}) {
  return (
    <Field>
      <Label>Backup</Label>
      <Description>
        {backups.length > 0
          ? "Each run replaces the app's data with this backup. Anything changed since is lost."
          : 'This app has no backups yet. Take one with Back up now on the App page.'}
      </Description>
      {backups.length > 0 && (
        <Select value={value} onChange={onChange} disabled={disabled}>
          {backups.map((backup) => (
            <option key={backup.id} value={backup.id}>
              {backupLabel(backup)}
            </option>
          ))}
        </Select>
      )}
    </Field>
  )
}
