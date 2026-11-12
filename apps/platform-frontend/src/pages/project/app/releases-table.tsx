import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { formatBytes } from '@/lib/artifacts'
import { taskPath } from '@/lib/taskPath'
import type { AppReleaseView, AppView } from '@viberglass/types'
import { Fragment, useState } from 'react'
import { ReleaseBuildLog } from './release-build-log'

type BadgeColor = 'green' | 'red' | 'amber' | 'sky' | 'zinc'

export function releaseStatus(release: AppReleaseView, currentId: string | null): { label: string; color: BadgeColor; reason: string | null } {
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
export function canRestore(release: AppReleaseView, currentId: string | null): boolean {
  return (
    release.id !== currentId &&
    release.status === 'ready' &&
    !release.bundleRemoved &&
    Boolean(release.wentLiveAt || release.rolledBackAt)
  )
}

export const shortSha = (sha: string) => sha.slice(0, 7)

export function ReleasesTable({
  projectId,
  spaceSlug,
  releases,
  current,
  tasks,
  onRestore,
}: {
  projectId: string
  spaceSlug: string
  releases: AppReleaseView[]
  current: AppReleaseView | null
  tasks: AppView['tasks']
  /** Only for maintainers, and not while a rollback is under way. */
  onRestore?: (release: AppReleaseView) => void
}) {
  const currentId = current?.id ?? null
  const [openLog, setOpenLog] = useState<string | null>(null)
  return (
    <Table className="[--gutter:--spacing(4)]">
      <TableHead>
        <TableRow>
          <TableHeader>Release</TableHeader>
          <TableHeader>Status</TableHeader>
          <TableHeader>Task</TableHeader>
          <TableHeader>Reason</TableHeader>
          <TableHeader>Built</TableHeader>
          <TableHeader>Size</TableHeader>
          <TableHeader>
            <span className="sr-only">Actions</span>
          </TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {releases.map((release) => {
          const status = releaseStatus(release, currentId)
          const task = release.ticketId ? tasks[release.ticketId] : undefined
          const logOpen = openLog === release.id
          return (
            <Fragment key={release.id}>
              <TableRow>
                <TableCell className="font-mono text-sm">{shortSha(release.commitSha)}</TableCell>
                <TableCell>
                  <Badge color={status.color}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-sm">
                  {release.ticketId && task ? (
                    <Link
                      href={taskPath(spaceSlug, { id: release.ticketId, key: task.key })}
                      title={task.title}
                      className="font-mono text-xs text-[var(--gray-11)] underline decoration-[var(--gray-7)] underline-offset-2"
                    >
                      {task.key}
                    </Link>
                  ) : (
                    '-'
                  )}
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
                <TableCell className="text-sm text-[var(--gray-10)] tabular-nums">{release.bundleBytes === null ? '-' : formatBytes(release.bundleBytes)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  {release.status !== 'building' && (
                    <Button
                      plain
                      aria-expanded={logOpen}
                      aria-label={`${logOpen ? 'Hide the build log' : 'Build log'} for ${shortSha(release.commitSha)}`}
                      onClick={() => setOpenLog(logOpen ? null : release.id)}
                    >
                      {logOpen ? 'Hide build log' : 'Build log'}
                    </Button>
                  )}
                  {onRestore && canRestore(release, currentId) && (
                    <Button plain onClick={() => onRestore(release)}>
                      {isOlder(release, current) ? 'Roll back' : 'Make live'}
                    </Button>
                  )}
                </TableCell>
              </TableRow>
              {logOpen && (
                <TableRow>
                  <TableCell colSpan={7} className="bg-[var(--gray-2)]">
                    <ReleaseBuildLog projectId={projectId} releaseId={release.id} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}

export function isOlder(release: AppReleaseView, current: AppReleaseView | null): boolean {
  return Boolean(current && release.createdAt < current.createdAt)
}
