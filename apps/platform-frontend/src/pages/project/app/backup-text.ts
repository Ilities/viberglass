import type { AppDataBackup, AppDataBackupReason } from '@viberglass/types'
import { shortSha } from './releases-table'

export const BACKUP_REASONS: Record<AppDataBackupReason, string> = {
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
  return `${takenAt}${release} · ${BACKUP_REASONS[backup.reason]}`
}
