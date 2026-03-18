import { Badge } from '@/components/badge'
import { JobStatusIndicator } from '@/components/job-status-indicator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatTimestamp } from '@/data'
import { JobListItem } from '@/service/api/job-api'

interface JobsTableProps {
  jobs: JobListItem[]
  project?: string
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start) return '-'
  const startTime = new Date(start).getTime()
  const endTime = end ? new Date(end).getTime() : Date.now()
  const durationMs = endTime - startTime
  const seconds = Math.floor(durationMs / 1000)
  const minutes = Math.floor(seconds / 60)

  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`
  }
  return `${seconds}s`
}

function truncateTask(task: string, maxLength: number = 60): string {
  if (task.length <= maxLength) return task
  return task.slice(0, maxLength) + '...'
}

function formatJobKind(kind: 'research' | 'execution' | 'planning' | 'claw'): string {
  switch (kind) {
    case 'research':
      return 'Research'
    case 'execution':
      return 'Execution'
    case 'planning':
      return 'Planning'
    case 'claw':
      return 'Scheduled'
  }
}

function jobKindBadgeColor(kind: 'research' | 'execution' | 'planning' | 'claw') {
  if (kind === 'research') return 'blue' as const
  if (kind === 'planning') return 'teal' as const
  if (kind === 'claw') return 'amber' as const
  return 'violet' as const
}

export function JobsTable({ jobs, project }: JobsTableProps) {
  return (
    <Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
      <TableHead>
        <TableRow>
          <TableHeader>Status</TableHeader>
          <TableHeader>Task</TableHeader>
          <TableHeader>Related Ticket</TableHeader>
          <TableHeader>Repository</TableHeader>
          <TableHeader>Duration</TableHeader>
          <TableHeader>Created</TableHeader>
        </TableRow>
      </TableHead>
      <TableBody>
        {jobs.map((job) => {
          const jobProject = job.projectSlug || project
          if (!jobProject) return null
          return (
            <TableRow key={job.jobId} href={`/project/${jobProject}/jobs/${job.jobId}`} title={`View job ${job.jobId}`}>
              <TableCell>
                <JobStatusIndicator status={job.status} />
              </TableCell>
              <TableCell className="max-w-md">
                <div className="flex items-center gap-2">
                  <Badge color={jobKindBadgeColor(job.jobKind)}>{formatJobKind(job.jobKind)}</Badge>
                  <span className="font-medium" title={job.task}>
                    {truncateTask(job.task)}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                {job.ticket ? (
                  <div className="flex items-center gap-2">
                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200">
                      {job.ticket.externalTicketId || 'Internal'}
                    </Badge>
                    <span
                      className="max-w-32 truncate text-sm text-zinc-600 dark:text-zinc-400"
                      title={job.ticket.title}
                    >
                      {job.ticket.title}
                    </span>
                  </div>
                ) : job.jobKind === 'claw' ? (
                  <span className="text-sm text-amber-600 dark:text-amber-400">Scheduled task</span>
                ) : (
                  <span className="text-zinc-400">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  {job.repository.split('/').slice(-2).join('/')}
                </span>
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">
                {formatDuration(job.processedAt, job.finishedAt)}
              </TableCell>
              <TableCell className="text-zinc-500 dark:text-zinc-400">{formatTimestamp(job.createdAt)}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
