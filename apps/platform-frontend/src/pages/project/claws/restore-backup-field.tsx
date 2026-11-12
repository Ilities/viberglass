import { Description, Field, Label } from '@/components/fieldset'
import { Select } from '@/components/select'
import type { AppDataBackup } from '@viberglass/types'
import { backupLabel } from '../app/backup-text'

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
