import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Link } from '@/components/link'
import type { Project } from '@/data'
import type { ProjectActivity, SignalColor } from '@/pages/dashboard/types'
import { getLastActivity, getSpaceSignal } from '@/pages/dashboard/spaceSignals'
import { TICKET_STATUS } from '@viberglass/types'

const SIGNAL_DOT: Record<SignalColor, string> = {
  red: 'bg-red-500',
  orange: 'bg-orange-500',
  amber: 'bg-amber-500',
  yellow: 'bg-yellow-500',
  blue: 'bg-blue-500',
  green: 'bg-green-500',
  zinc: 'bg-zinc-400',
}

export function SpaceCard({ project, activity }: { project: Project; activity: ProjectActivity }) {
  const signal = getSpaceSignal(project, activity.tickets, activity.jobs)
  const lastActivity = getLastActivity(activity.tickets, activity.jobs)
  const openTaskCount = activity.tickets.filter((ticket) => ticket.status !== TICKET_STATUS.RESOLVED).length
  const failedRunCount = activity.jobs.filter((job) => job.status === 'failed').length
  const runningRunCount = activity.jobs.filter((job) => job.status === 'active' || job.status === 'queued').length

  return (
    <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar initials={project.name.substring(0, 2).toUpperCase()} className="bg-brand-gradient size-10 text-brand-charcoal" />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{project.name}</div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{project.slug}</div>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${SIGNAL_DOT[signal.color]}`} />
        {signal.summary}
      </p>
      {lastActivity ? <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{lastActivity}</p> : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge color={openTaskCount > 0 ? 'amber' : 'zinc'}>{openTaskCount} open</Badge>
        <Badge color={failedRunCount > 0 ? 'red' : 'zinc'}>{failedRunCount} failed</Badge>
        <Badge color={runningRunCount > 0 ? 'blue' : 'zinc'}>{runningRunCount} running</Badge>
      </div>

      <div className="mt-4 flex items-center gap-3">
        {signal.action ? (
          <>
            <Button href={signal.action.href} color="brand" size="medium" className="h-9">
              {signal.action.label}
            </Button>
            <Link href={`/spaces/${project.slug}`} className="ui-text-action">
              Open space
            </Link>
          </>
        ) : (
          <Button href={`/spaces/${project.slug}`} outline size="medium" className="h-9">
            Open space
          </Button>
        )}
      </div>
    </div>
  )
}
