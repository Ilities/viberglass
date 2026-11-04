import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import type { AppRelease } from '@viberglass/types'

type BadgeColor = 'green' | 'red' | 'amber' | 'sky' | 'zinc'

export function releaseStatus(release: AppRelease, currentId: string | null): { label: string; color: BadgeColor; reason: string | null } {
  if (release.id === currentId) return { label: 'Live', color: 'green', reason: null }
  if (release.status === 'building') return { label: 'Building', color: 'sky', reason: null }
  if (release.status === 'failed') return { label: 'Build failed', color: 'red', reason: release.failureReason }
  if (release.liveFailure) return { label: "Didn't go live", color: 'amber', reason: release.liveFailure }
  if (release.bundleRemoved) return { label: 'Removed', color: 'zinc', reason: null }
  if (release.rolledBackAt) return { label: 'Rolled back', color: 'amber', reason: null }
  if (release.wentLiveAt) return { label: 'Was live', color: 'zinc', reason: null }
  return { label: 'Ready', color: 'zinc', reason: null }
}

/** Whether a maintainer can make this release the live one, the way the server allows it. */
export function canRestore(release: AppRelease, currentId: string | null): boolean {
  return (
    release.id !== currentId &&
    release.status === 'ready' &&
    !release.bundleRemoved &&
    Boolean(release.wentLiveAt || release.rolledBackAt)
  )
}

export const shortSha = (sha: string) => sha.slice(0, 7)

export function ReleasesTable({
  releases,
  current,
  onRestore,
}: {
  releases: AppRelease[]
  current: AppRelease | null
  /** Only for maintainers, and not while a rollback is under way. */
  onRestore?: (release: AppRelease) => void
}) {
  const currentId = current?.id ?? null
  return (
    <Table className="[--gutter:--spacing(4)]">
      <TableHead>
        <TableRow>
          <TableHeader>Release</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Reason</TableHeader>
          <TableHeader>Built</TableHeader>
          {onRestore && (
            <TableHeader>
              <span className="sr-only">Actions</span>
            </TableHeader>
          )}
        </TableRow>
      </TableHead>
      <TableBody>
        {releases.map((release) => {
          const status = releaseStatus(release, currentId)
          return (
            <TableRow key={release.id}>
              <TableCell className="font-mono text-sm">{shortSha(release.commitSha)}</TableCell>
              <TableCell>
                <Badge color={status.color}>{status.label}</Badge>
              </TableCell>
              <TableCell className="max-w-md text-sm text-[var(--gray-11)]">
                {status.reason ? (
                  <span className="line-clamp-2" title={status.reason}>
                    {status.reason}
                  </span>
                ) : (
                  '-'
                )}
              </TableCell>
              <TableCell className="text-[var(--gray-10)]">
                <Timestamp date={release.createdAt} />
              </TableCell>
              {onRestore && (
                <TableCell className="text-right">
                  {canRestore(release, currentId) && (
                    <Button plain onClick={() => onRestore(release)}>
                      {isOlder(release, current) ? 'Roll back' : 'Make live'}
                    </Button>
                  )}
                </TableCell>
              )}
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function isOlder(release: AppRelease, current: AppRelease | null): boolean {
  return Boolean(current && release.createdAt < current.createdAt)
}
