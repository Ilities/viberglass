import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { formatJobStatus } from '@/data'
import type { JobListItem } from '@/service/api/job-api'
import clsx from 'clsx'
import { useSearchParams } from 'react-router-dom'
import { formatRunDuration } from '../jobs/run-facts'
import { runName } from './step-runs'

const STATUS_DOT: Record<JobListItem['status'], string> = {
  queued: 'bg-amber-500',
  active: 'bg-blue-500 animate-pulse',
  completed: 'bg-green-600',
  failed: 'bg-red-500',
  cancelled: 'bg-[var(--gray-8)]',
}

/** Older runs remain reachable even when they predate the conversation. */
export function TaskRunHistory({ runs, open = false }: { runs: JobListItem[]; open?: boolean }) {
  const [searchParams] = useSearchParams()
  if (runs.length === 0) return null
  return (
    <details open={open || undefined} className="rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] px-5 py-4">
      <summary className="cursor-pointer text-sm text-[var(--gray-11)]">Run history · {runs.length}</summary>
      <ol className="mt-3 divide-y divide-[var(--gray-4)]">
        {runs.map((run, index) => {
          const next = new URLSearchParams(searchParams)
          next.set('run', run.jobId)
          next.delete('runTab')
          const selected = searchParams.get('run') === run.jobId
          const duration = formatRunDuration(run.processedAt, run.finishedAt)
          return (
            <li key={run.jobId}>
              <Link href={`?${next}`} aria-current={selected ? true : undefined} className={clsx("flex items-center gap-2.5 py-3 text-sm hover:text-[var(--accent-11)]", selected && "text-[var(--accent-11)]")}>
                <span aria-hidden className={clsx('size-2 shrink-0 rounded-full', STATUS_DOT[run.status])} />
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{runName(run.jobKind)} #{runs.length - index}</span>
                  <span className="block text-xs text-[var(--gray-10)]">
                    {formatJobStatus(run.status).label}{duration && ` · ${duration}`}
                  </span>
                </span>
                <Timestamp date={run.createdAt} className="shrink-0 text-xs text-[var(--gray-9)]" />
              </Link>
            </li>
          )
        })}
      </ol>
    </details>
  )
}
