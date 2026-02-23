import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Link } from '@/components/link'
import type { Project } from '@/data'
import type { ProjectActivity } from '@/pages/dashboard/types'
import { getLatestWhisper, getProjectSignal } from '@/pages/dashboard/projectSignals'
import { TICKET_STATUS } from '@viberglass/types'

export function ProjectConstellationCard({
  project,
  activity,
  delayIndex,
  showWhisper,
}: {
  project: Project
  activity: ProjectActivity
  delayIndex: number
  showWhisper: boolean
}) {
  const signal = getProjectSignal(project, activity.tickets, activity.jobs)
  const openTicketCount = activity.tickets.filter((ticket) => ticket.status !== TICKET_STATUS.RESOLVED).length
  const failedJobCount = activity.jobs.filter((job) => job.status === 'failed').length
  const runningJobCount = activity.jobs.filter((job) => job.status === 'active' || job.status === 'queued').length

  return (
    <div
      className="hover-lift slide-up rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
      style={{ animationDelay: `${delayIndex * 0.1}s` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar initials={project.name.substring(0, 2).toUpperCase()} className="bg-brand-gradient size-10 text-brand-charcoal" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{project.name}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">{project.slug}</div>
          </div>
        </div>
        <Badge color={signal.color}>{signal.label}</Badge>
      </div>

      <p className="mt-4 font-mono text-xs text-zinc-500 dark:text-zinc-400">{signal.glyph}</p>
      <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">{signal.blurb}</p>
      {showWhisper ? (
        <p className="mt-3 rounded border border-zinc-950/10 bg-zinc-50 px-2 py-1 text-xs text-zinc-500 dark:border-white/10 dark:bg-zinc-950 dark:text-zinc-400">
          {getLatestWhisper(project, activity.tickets, activity.jobs)}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Badge color={openTicketCount > 0 ? 'amber' : 'zinc'}>{openTicketCount} open</Badge>
        <Badge color={failedJobCount > 0 ? 'red' : 'zinc'}>{failedJobCount} failed</Badge>
        <Badge color={runningJobCount > 0 ? 'blue' : 'zinc'}>{runningJobCount} running</Badge>
      </div>

      <div className="mt-4 flex gap-2">
        <Button href={signal.nextHref} color="brand" size="medium" className="h-9">
          {signal.nextLabel}
        </Button>
        <Link
          href={`/project/${project.slug}`}
          className="ui-text-action"
        >
          Open
        </Link>
      </div>
    </div>
  )
}
