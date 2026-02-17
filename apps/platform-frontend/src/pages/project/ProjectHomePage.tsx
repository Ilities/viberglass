import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { FunLoading } from '@/components/fun-loading'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import type { Clanker, JobListItem, TicketStats, TicketSummary } from '@/data'
import {
  formatSeverity,
  formatTicketSystem,
  getClankersList,
  getProjectJobs,
  getRecentTickets,
  getTicketStats,
} from '@/data'
import { formatJobStatus, formatTimestamp } from '@/lib/formatters'
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

// ASCII Art decorations for Clankers
const clankerAvatars: Record<string, string> = {
  active: `[^_^]`,
  inactive: `[._.]`,
  deploying: `[o_o]`,
  failed: `[x_x]`,
}

function getGreeting(): string {
  const hour = new Date().getHours()
  const greetings = {
    morning: [
      "Don't Panic",
      "The Guide says you're doing fine",
      'Another day in this wholly remarkable universe',
      'Tea first, then bugs',
    ],
    afternoon: [
      'Time is an illusion',
      'Halfway through another improbable day',
      'The universe is big. Really big',
      'Mostly harmless progress',
    ],
    evening: [
      "The ships hung in the sky much as bricks don't",
      'Evening approaches with alarming regularity',
      'Almost time for a Pan Galactic Gargle Blaster',
      'The Answer is still 42',
    ],
    night: [
      'Share and Enjoy',
      "Life. Don't talk to me about life",
      'Here you are, brain the size of a planet',
      'So it goes, in the late hours',
    ],
  }

  let timeOfDay: keyof typeof greetings
  if (hour >= 5 && hour < 12) timeOfDay = 'morning'
  else if (hour >= 12 && hour < 17) timeOfDay = 'afternoon'
  else if (hour >= 17 && hour < 21) timeOfDay = 'evening'
  else timeOfDay = 'night'

  const options = greetings[timeOfDay]
  return options[Math.floor(Math.random() * options.length)]
}

function MetricCard({ label, value, subtext }: { label: string; value: string | number; subtext?: string }) {
  const isTheAnswer = value === '42' || value === 42

  return (
    <div className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-5 transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-gray-700">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
          <p
            className={`mt-2 text-3xl font-semibold tracking-tight text-gray-900 dark:text-white ${isTheAnswer ? 'pulse-glow text-brand-burnt-orange' : ''}`}
          >
            {value}
          </p>
          {subtext && <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtext}</p>}
        </div>
      </div>
    </div>
  )
}

interface ActivityPoint {
  hour: number
  label: string
  ticketCount: number
  jobCount: number
}

function TimelineBar({ tickets, jobs }: { tickets: TicketSummary[]; jobs: JobListItem[] }) {
  const currentHour = new Date().getHours()
  const today = new Date().toDateString()

  // Build activity data for business hours (8am - 6pm)
  const businessHours = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]

  const activityData: ActivityPoint[] = useMemo(() => {
    return businessHours.map((hour) => {
      const hourLabel = hour <= 12 ? `${hour}am` : `${hour - 12}pm`

      // Count tickets created in this hour today
      const ticketCount = tickets.filter((t) => {
        const ticketDate = new Date(t.timestamp)
        return ticketDate.toDateString() === today && ticketDate.getHours() === hour
      }).length

      // Count jobs created in this hour today
      const jobCount = jobs.filter((j) => {
        const jobDate = new Date(j.createdAt)
        return jobDate.toDateString() === today && jobDate.getHours() === hour
      }).length

      return { hour, label: hourLabel, ticketCount, jobCount }
    })
  }, [tickets, jobs])

  // Find max activity for scaling
  const maxActivity = Math.max(...activityData.map((d) => d.ticketCount + d.jobCount), 1)
  const totalToday =
    tickets.filter((t) => new Date(t.timestamp).toDateString() === today).length +
    jobs.filter((j) => new Date(j.createdAt).toDateString() === today).length

  // Show every other hour to avoid crowding
  const displayHours = activityData.filter((_, idx) => idx % 2 === 0)

  return (
    <div className="mb-6 rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
      <div className="mb-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>TODAY'S ACTIVITY</span>
        <div className="flex items-center gap-3">
          <span className="text-gray-400 dark:text-gray-500">{totalToday} events today</span>
          <span className="font-medium text-brand-burnt-orange">
            {currentHour >= 8 && currentHour <= 18 ? 'Working Hours' : 'After Hours'}
          </span>
        </div>
      </div>

      <div className="relative h-16">
        {/* Background grid lines */}
        <div className="absolute inset-0 flex justify-between px-3">
          {displayHours.map((_, idx) => (
            <div key={idx} className="h-full w-px bg-gray-100 dark:bg-gray-800" />
          ))}
        </div>

        {/* Activity bars */}
        <div className="absolute inset-0 flex items-end justify-between gap-1 px-2">
          {displayHours.map((data) => {
            const totalActivity = data.ticketCount + data.jobCount
            const isPast = currentHour > data.hour
            const isCurrent = currentHour === data.hour

            return (
              <div key={data.hour} className="flex flex-1 flex-col items-center">
                <div className="relative flex h-10 w-full items-end justify-center gap-0.5">
                  {/* Ticket portion */}
                  {data.ticketCount > 0 && (
                    <div
                      className={`w-2 rounded-t transition-all duration-500 ${
                        isCurrent
                          ? 'bg-brand-burnt-orange'
                          : isPast
                            ? 'bg-orange-500 dark:bg-orange-600'
                            : 'bg-orange-300 dark:bg-orange-800'
                      }`}
                      style={{
                        height: `${(data.ticketCount / maxActivity) * 100}%`,
                        minHeight: data.ticketCount > 0 ? '4px' : '0',
                      }}
                      title={`${data.ticketCount} tickets at ${data.label}`}
                    />
                  )}
                  {/* Job portion */}
                  {data.jobCount > 0 && (
                    <div
                      className={`w-2 rounded-t transition-all duration-500 ${
                        isCurrent ? 'bg-sky-500' : isPast ? 'bg-sky-500 dark:bg-sky-600' : 'bg-sky-300 dark:bg-sky-800'
                      }`}
                      style={{
                        height: `${(data.jobCount / maxActivity) * 100}%`,
                        minHeight: data.jobCount > 0 ? '4px' : '0',
                      }}
                      title={`${data.jobCount} jobs at ${data.label}`}
                    />
                  )}
                  {/* Empty state indicator */}
                  {totalActivity === 0 && <div className="h-1 w-1 rounded-full bg-gray-200 dark:bg-gray-700" />}
                </div>
                <span
                  className={`mt-2 text-xs ${isCurrent ? 'font-medium text-brand-burnt-orange' : 'text-gray-400 dark:text-gray-500'}`}
                >
                  {data.label}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="mt-3 flex items-center gap-4 border-t border-gray-100 pt-3 dark:border-gray-800">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-orange-500 dark:bg-orange-600" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Tickets</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-sm bg-sky-500 dark:bg-sky-600" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Jobs</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-brand-burnt-orange" />
          <span className="text-xs text-gray-500 dark:text-gray-400">Current hour</span>
        </div>
      </div>
    </div>
  )
}

function TicketCard({ ticket, project }: { ticket: TicketSummary; project: string }) {
  const severity = formatSeverity(ticket.severity)

  return (
    <Link
      href={`/project/${project}/tickets/${ticket.id}`}
      className="group block rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-burnt-orange/30 hover:shadow-md dark:border-white/10 dark:bg-zinc-900"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400 dark:text-gray-500">#{ticket.id.slice(-4)}</span>
            <Badge color={severity.badgeColor}>{severity.label}</Badge>
            {ticket.autoFixStatus && (
              <Badge
                className={
                  ticket.autoFixStatus === 'in_progress'
                    ? 'bg-blue-100 text-blue-800'
                    : ticket.autoFixStatus === 'completed'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                }
              >
                {ticket.autoFixStatus === 'in_progress'
                  ? 'Fixing'
                  : ticket.autoFixStatus === 'completed'
                    ? 'Fixed'
                    : 'Pending'}
              </Badge>
            )}
          </div>
          <h4 className="line-clamp-2 font-medium text-gray-900 transition-colors group-hover:text-brand-burnt-orange dark:text-white">
            {ticket.title}
          </h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{ticket.category}</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(ticket.timestamp)}</span>
          <div className="mt-1">
            <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
              {formatTicketSystem(ticket.ticketSystem)}
            </Badge>
          </div>
        </div>
      </div>
    </Link>
  )
}

function JobCard({ job }: { job: JobListItem }) {
  const status = formatJobStatus(job.status)

  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-gray-700">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex items-center gap-2">
            <Badge color={status.color}>{status.label}</Badge>
            <span className="font-mono text-xs text-gray-400 dark:text-gray-500">#{job.jobId.slice(-6)}</span>
          </div>
          <h4 className="line-clamp-1 font-medium text-gray-900 dark:text-white">{job.repository}</h4>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{job.task}</p>
        </div>
        <div className="text-right">
          <span className="text-xs text-gray-400 dark:text-gray-500">{formatTimestamp(job.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

function ClankerCard({ clanker }: { clanker: Clanker }) {
  const statusColors: Record<string, string> = {
    active: 'text-green-600 dark:text-green-400',
    inactive: 'text-gray-500 dark:text-gray-400',
    deploying: 'text-blue-600 dark:text-blue-400',
    failed: 'text-red-600 dark:text-red-400',
  }

  return (
    <div className="group rounded-lg border border-gray-200 bg-white p-4 transition-all duration-200 hover:border-gray-300 hover:shadow-md dark:border-white/10 dark:bg-zinc-900 dark:hover:border-gray-700">
      <div className="flex items-center gap-3">
        <div className={`font-mono text-lg ${statusColors[clanker.status]}`}>
          {clankerAvatars[clanker.status] || '[? ?]'}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-medium text-gray-900 dark:text-white">{clanker.name}</h4>
            <div
              className={`h-2 w-2 rounded-full ${clanker.status === 'active' ? 'animate-pulse bg-green-500' : clanker.status === 'failed' ? 'bg-red-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            />
          </div>
          <p className="text-sm text-gray-500 capitalize dark:text-gray-400">{clanker.status}</p>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold tracking-wider text-gray-900 uppercase dark:text-white">{title}</h3>
        {count !== undefined && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 dark:bg-gray-800 dark:text-gray-400">
            {count}
          </span>
        )}
      </div>
      {action}
    </div>
  )
}

export function ProjectHomePage() {
  const { project } = useParams<{ project: string }>()
  const [tickets, setTickets] = useState<TicketSummary[]>([])
  const [stats, setStats] = useState<TicketStats | null>(null)
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [jobs, setJobs] = useState<JobListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const [t, s, c, j] = await Promise.all([
        getRecentTickets(project!),
        getTicketStats(project!),
        getClankersList(),
        getProjectJobs(project!, 20),
      ])
      setTickets(t)
      setStats(s)
      setClankers(c.filter((cl: Clanker) => cl.status === 'active').slice(0, 4))
      setJobs(j)
      setIsLoading(false)
    }
    loadData()
  }, [project])

  const [greeting] = useState(getGreeting)

  const metrics = useMemo(() => {
    if (!stats) return null

    const today = new Date().toDateString()
    const todayTickets = tickets.filter((t) => new Date(t.timestamp).toDateString() === today).length
    const todayResolved = tickets.filter(
      (t) => t.autoFixStatus === 'completed' && new Date(t.timestamp).toDateString() === today
    ).length

    return {
      total: stats.total,
      open: stats.open,
      inProgress: stats.inProgress,
      autoFixRequested: stats.autoFixStats.requested,
      autoFixPending: stats.autoFixStats.pending,
      autoFixCompleted: stats.autoFixStats.completed,
      resolved: stats.resolved,
      todayTickets,
      todayResolved,
    }
  }, [stats, tickets])

  if (isLoading || !metrics) {
    return <FunLoading retro />
  }

  const inProgressTickets = tickets.filter((t) => t.autoFixStatus === 'in_progress').slice(0, 2)
  const openTickets = tickets.filter((t) => !t.autoFixStatus || t.autoFixStatus === 'pending').slice(0, 2)
  const resolvedTickets = tickets.filter((t) => t.autoFixStatus === 'completed').slice(0, 2)
  const activeJobs = jobs.filter((j) => j.status === 'active')
  const queuedJobs = jobs.filter((j) => j.status === 'queued')

  return (
    <>
      <PageMeta title={project ? `${project} | Mission Control` : 'Loading...'} />
      <div className="space-y-8">
        <div className="flex items-end justify-between">
          <div>
            <p className="font-mono text-sm text-gray-500 dark:text-gray-400">{greeting}</p>
            <Heading className="mt-1">Mission Control</Heading>
          </div>
          <div className="flex gap-2">
            <Button href={`/project/${project}/tickets`} outline>
              View Tickets
            </Button>
            <Button href={`/project/${project}/jobs`}>Queue Job</Button>
          </div>
        </div>

        <TimelineBar tickets={tickets} jobs={jobs} />

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard label="Total Tickets" value={metrics.total} subtext={`${metrics.todayTickets} created today`} />
          <MetricCard label="Open Issues" value={metrics.open} subtext={`${metrics.inProgress} in progress`} />
          <MetricCard
            label="Auto-Fix Queue"
            value={metrics.autoFixPending}
            subtext={`${metrics.autoFixRequested} total requested`}
          />
          <MetricCard label="Resolved" value={metrics.resolved} subtext={`${metrics.todayResolved} completed today`} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            {inProgressTickets.length > 0 && (
              <section>
                <SectionHeader
                  title="In Progress"
                  count={inProgressTickets.length}
                  action={<span className="text-xs text-gray-500 dark:text-gray-400">Clankers working</span>}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  {inProgressTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} project={project!} />
                  ))}
                </div>
              </section>
            )}

            {openTickets.length > 0 && (
              <section>
                <SectionHeader title="Awaiting Assignment" count={openTickets.length} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {openTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} project={project!} />
                  ))}
                </div>
              </section>
            )}

            {resolvedTickets.length > 0 && (
              <section>
                <SectionHeader title="Recently Resolved" count={resolvedTickets.length} />
                <div className="grid gap-3 sm:grid-cols-2">
                  {resolvedTickets.map((ticket) => (
                    <TicketCard key={ticket.id} ticket={ticket} project={project!} />
                  ))}
                </div>
              </section>
            )}

            {(activeJobs.length > 0 || queuedJobs.length > 0) && (
              <section>
                <SectionHeader
                  title="Job Queue"
                  count={jobs.length}
                  action={
                    <Link href={`/project/${project}/jobs`} className="text-xs text-brand-burnt-orange hover:underline">
                      View all
                    </Link>
                  }
                />
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <JobCard key={job.jobId} job={job} />
                  ))}
                  {queuedJobs.slice(0, 2).map((job) => (
                    <JobCard key={job.jobId} job={job} />
                  ))}
                </div>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <section>
              <SectionHeader
                title="Clanker Fleet"
                count={clankers.length}
                action={
                  <Link href="/clankers" className="text-xs text-brand-burnt-orange hover:underline">
                    Manage
                  </Link>
                }
              />
              <div className="space-y-2">
                {clankers.map((clanker) => (
                  <ClankerCard key={clanker.id} clanker={clanker} />
                ))}
              </div>
              {clankers.length === 0 && (
                <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
                  <p className="text-gray-500 dark:text-gray-400">No active Clankers</p>
                  <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">The fleet is dormant</p>
                </div>
              )}
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
              <h3 className="mb-4 text-sm font-semibold tracking-wider text-gray-900 uppercase dark:text-white">
                Severity Breakdown
              </h3>
              <div className="space-y-3">
                {stats &&
                  Object.entries(stats.bySeverity).map(([severity, countVal]) => {
                    const severityInfo = formatSeverity(severity)
                    const total = stats.total || 1
                    const count = countVal as number
                    const percentage = Math.round((count / total) * 100)
                    return (
                      <div key={severity} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-gray-500 capitalize dark:text-gray-400">{severity}</div>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
                          <div
                            className={`h-full rounded-full ${severityInfo.barColor}`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                        <div className="w-8 text-right text-xs text-gray-700 dark:text-gray-300">{count}</div>
                      </div>
                    )
                  })}
              </div>
            </section>

            {stats && Object.keys(stats.byCategory).length > 0 && (
              <section className="rounded-lg border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
                <h3 className="mb-4 text-sm font-semibold tracking-wider text-gray-900 uppercase dark:text-white">
                  Categories
                </h3>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(stats.byCategory)
                    .slice(0, 6)
                    .map(([category, countVal]) => (
                      <div
                        key={category}
                        className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-2.5 py-1 text-xs dark:bg-gray-800"
                      >
                        <span className="text-gray-700 dark:text-gray-300">{category}</span>
                        <span className="text-gray-400 dark:text-gray-500">{countVal as number}</span>
                      </div>
                    ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
