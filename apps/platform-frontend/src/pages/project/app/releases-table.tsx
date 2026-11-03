import { Badge } from '@/components/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Timestamp } from '@/components/timestamp'
import type { AppRelease } from '@viberglass/types'

type BadgeColor = 'green' | 'red' | 'amber' | 'sky' | 'zinc'

export function releaseStatus(release: AppRelease, currentId: string | null): { label: string; color: BadgeColor; reason: string | null } {
  if (release.id === currentId) return { label: 'Live', color: 'green', reason: null }
  if (release.status === 'building') return { label: 'Building', color: 'sky', reason: null }
  if (release.status === 'failed') return { label: 'Build failed', color: 'red', reason: release.failureReason }
  if (release.liveFailure) return { label: "Didn't go live", color: 'amber', reason: release.liveFailure }
  if (release.wentLiveAt) return { label: 'Was live', color: 'zinc', reason: null }
  return { label: 'Ready', color: 'zinc', reason: null }
}

export const shortSha = (sha: string) => sha.slice(0, 7)

export function ReleasesTable({ releases, currentId }: { releases: AppRelease[]; currentId: string | null }) {
  return (
    <Table className="[--gutter:--spacing(4)]">
      <TableHead>
        <TableRow>
          <TableHeader>Release</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Reason</TableHeader>
          <TableHeader>Built</TableHeader>
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
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
