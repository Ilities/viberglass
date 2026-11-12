import { Subheading } from '@/components/heading'
import { Text } from '@/components/text'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import { formatBytes } from '@/lib/artifacts'
import { getAppBackups } from '@/service/api/app-api'
import type { AppDataBackup } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { BACKUP_REASONS } from './backup-text'
import { shortSha } from './releases-table'

const SHOWN = 5

/** The app's kept copies of its data, newest first; a schedule can put one back. */
export function AppBackups({ projectId, refreshKey }: { projectId: string; refreshKey: unknown }) {
  const [backups, setBackups] = useState<AppDataBackup[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    let cancelled = false
    getAppBackups(projectId)
      .then((loaded) => {
        if (cancelled) return
        setBackups(loaded)
        setError(null)
      })
      .catch((failure: unknown) => !cancelled && setError(failure instanceof Error ? failure.message : "Couldn't load the backups"))
    return () => {
      cancelled = true
    }
  }, [projectId, refreshKey])

  if (!error && (backups === null || backups.length === 0)) return null
  return (
    <section aria-labelledby="app-backups" className="mt-8 border-t border-[var(--gray-5)] pt-4">
      <Subheading id="app-backups">Backups</Subheading>
      <Text className="mt-1">Copies of the app&apos;s data. Roll back with data, or put one back on a schedule.</Text>
      {error ? (
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : (
        <Table className="mt-4 [--gutter:--spacing(4)]">
          <TableHead>
            <TableRow>
              <TableHeader>Taken</TableHeader>
              <TableHeader>Release</TableHeader>
              <TableHeader>Why</TableHeader>
              <TableHeader>Size</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {(showAll ? (backups ?? []) : (backups ?? []).slice(0, SHOWN)).map((backup) => (
              <TableRow key={backup.id}>
                <TableCell className="text-[var(--gray-11)]">
                  <Timestamp date={backup.takenAt} />
                </TableCell>
                <TableCell className="font-mono text-sm">{backup.fromRelease ? shortSha(backup.fromRelease.commitSha) : '-'}</TableCell>
                <TableCell className="text-sm text-[var(--gray-11)]">{BACKUP_REASONS[backup.reason]}</TableCell>
                <TableCell className="text-sm text-[var(--gray-10)] tabular-nums">{formatBytes(backup.bytes)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {backups && backups.length > SHOWN && (
        <button type="button" onClick={() => setShowAll((value) => !value)} className="mt-3 text-sm text-[var(--gray-11)] underline underline-offset-3">
          {showAll ? 'Show fewer' : `Show all ${backups.length} backups`}
        </button>
      )}
    </section>
  )
}
