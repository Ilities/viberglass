import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { formatSeverity, formatTicketSystem, getClankersList, getProjectJobs, getRecentTickets, getTicketStats } from '@/data'
import type { Clanker, JobListItem, TicketSummary, TicketStats } from '@/data'
import { useParams } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Link } from '@/components/link'
import { formatJobStatus, formatTimestamp } from '@/lib/formatters'

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
      "Another day in this wholly remarkable universe",
      "Tea first, then bugs",
    ],
    afternoon: [
      "Time is an illusion",
      "Halfway through another improbable day",
      "The universe is big. Really big",
      "Mostly harmless progress",
    ],
    evening: [
      "The ships hung in the sky much as bricks don't",
      "Evening approaches with alarming regularity",
      "Almost time for a Pan Galactic Gargle Blaster",
      "The Answer is still 42",
    ],
    night: [
      "Share and Enjoy",
      "Life. Don't talk to me about life",
      "Here you are, brain the size of a planet",
      "So it goes, in the late hours",
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

function MetricCard({ 
  label, 
  value, 
  change, 
  subtext,
  trend 
}: { 
  label: string
  value: string | number
  change?: string
  subtext?: string
  trend?: 'up' | 'down' | 'neutral'
}) {
  const isTheAnswer = value === '42' || value === 42
  const trendColor = trend === 'up' ? 'text-green-600 dark:text-green-400' : 
                     trend === 'down' ? 'text-red-600 dark:text-red-400' : 
                     'text-zinc-500 dark:text-zinc-400'
  
  return (
    <div className="group relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-5 transition-all duration-200 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{label}</p>
          <p className={`mt-2 text-3xl font-semibold tracking-tight ${isTheAnswer ? 'text-brand-burnt-orange pulse-glow' : 'text-zinc-900 dark:text-white'}`}>
            {value}
          </p>
          {change && (
            <p className={`mt-1 text-sm ${trendColor} flex items-center gap-1`}>
              <span>{change}</span>
              {subtext && <span className="text-zinc-400 dark:text-zinc-500">{subtext}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

function TimelineBar() {
  const hours = ['8am', '10am', '12pm', '2pm', '4pm', '6pm']
  const currentHour = new Date().getHours()
  
  return (
    <div className="mb-6 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400 mb-3">
        <span>TODAY'S ACTIVITY</span>
        <span className="text-brand-burnt-orange font-medium">Now</span>
      </div>
      <div className="relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-zinc-200 dark:bg-zinc-800 -translate-y-1/2" />
        <div className="relative flex justify-between">
          {hours.map((hour, idx) => {
            const hourNum = parseInt(hour)
            const isPast = currentHour > (hourNum + (hour.includes('pm') && hourNum !== 12 ? 12 : 0))
            const isCurrent = currentHour === (hourNum + (hour.includes('pm') && hourNum !== 12 ? 12 : 0))
            
            return (
              <div key={hour} className="flex flex-col items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isCurrent ? 'bg-brand-burnt-orange ring-4 ring-brand-burnt-orange/20' : isPast ? 'bg-zinc-400 dark:bg-zinc-600' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                <span className={`text-xs ${isCurrent ? 'text-brand-burnt-orange font-medium' : 'text-zinc-400 dark:text-zinc-500'}`}>{hour}</span>
              </div>
            )
          })}
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
      className="group block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 transition-all duration-200 hover:shadow-md hover:border-brand-burnt-orange/30 hover:-translate-y-0.5"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">#{ticket.id.slice(-4)}</span>
            <Badge className={severity.color}>{severity.label}</Badge>
            {ticket.autoFixStatus && (
              <Badge className={ticket.autoFixStatus === 'in_progress' ? 'bg-blue-100 text-blue-800' : ticket.autoFixStatus === 'completed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                {ticket.autoFixStatus === 'in_progress' ? 'Fixing' : ticket.autoFixStatus === 'completed' ? 'Fixed' : 'Pending'}
              </Badge>
            )}
          </div>
          <h4 className="font-medium text-zinc-900 dark:text-white line-clamp-2 group-hover:text-brand-burnt-orange transition-colors">
            {ticket.title}
          </h4>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {ticket.category}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatTimestamp(ticket.timestamp)}</span>
          <div className="mt-1">
            <Badge className="bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
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
    <div className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 transition-all duration-200 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <Badge color={status.color}>{status.label}</Badge>
            <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500">#{job.jobId.slice(-6)}</span>
          </div>
          <h4 className="font-medium text-zinc-900 dark:text-white line-clamp-1">
            {job.repository}
          </h4>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {job.task}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatTimestamp(job.createdAt)}</span>
        </div>
      </div>
    </div>
  )
}

function ClankerCard({ clanker }: { clanker: Clanker }) {
  const statusColors: Record<string, string> = {
    active: 'text-green-600 dark:text-green-400',
    inactive: 'text-zinc-500 dark:text-zinc-400',
    deploying: 'text-blue-600 dark:text-blue-400',
    failed: 'text-red-600 dark:text-red-400',
  }
  
  return (
    <div className="group rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4 transition-all duration-200 hover:shadow-md hover:border-zinc-300 dark:hover:border-zinc-700">
      <div className="flex items-center gap-3">
        <div className={`font-mono text-lg ${statusColors[clanker.status]}`}>
          {clankerAvatars[clanker.status] || '[? ?]'}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-zinc-900 dark:text-white truncate">{clanker.name}</h4>
            <div className={`w-2 h-2 rounded-full ${clanker.status === 'active' ? 'bg-green-500 animate-pulse' : clanker.status === 'failed' ? 'bg-red-500' : 'bg-zinc-300 dark:bg-zinc-600'}`} />
          </div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 capitalize">{clanker.status}</p>
        </div>
      </div>
    </div>
  )
}

function SectionHeader({ title, count, action }: { title: string; count?: number; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider">{title}</h3>
        {count !== undefined && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
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
        getProjectJobs(project!, 5)
      ])
      setTickets(t)
      setStats(s)
      setClankers(c.filter(cl => cl.status === 'active').slice(0, 4))
      setJobs(j)
      setIsLoading(false)
    }
    loadData()
  }, [project])

  const [greeting] = useState(getGreeting)

  if (isLoading) {
    return <FunLoading retro />
  }

  // Split tickets by status for pipeline view
  const inProgressTickets = tickets.filter(t => t.autoFixStatus === 'in_progress').slice(0, 2)
  const openTickets = tickets.filter(t => !t.autoFixStatus || t.autoFixStatus === 'pending').slice(0, 2)
  const resolvedTickets = tickets.filter(t => t.autoFixStatus === 'completed').slice(0, 2)

  // Split jobs by status
  const activeJobs = jobs.filter(j => j.status === 'active')
  const queuedJobs = jobs.filter(j => j.status === 'queued')

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 font-mono">{greeting}</p>
          <Heading className="mt-1">Mission Control</Heading>
        </div>
        <div className="flex gap-2">
          <Button href={`/project/${project}/tickets`} outline>View Tickets</Button>
          <Button href={`/project/${project}/jobs`}>Queue Job</Button>
        </div>
      </div>

      {/* Timeline */}
      <TimelineBar />

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard 
          label="Total Tickets" 
          value={stats?.total ?? 0} 
          change="+12.5%"
          subtext="vs last week"
          trend="up"
        />
        <MetricCard 
          label="Open Issues" 
          value={stats?.open ?? 0} 
          change="-2.1%"
          subtext="vs last week"
          trend="down"
        />
        <MetricCard 
          label="Auto-Fix Queue" 
          value={stats?.autoFixStats.requested ?? 0} 
          change="+8.3%"
          subtext="vs last week"
          trend="up"
        />
        <MetricCard 
          label="Resolved This Week" 
          value={stats?.resolved ?? 0} 
          change="+15.2%"
          subtext="vs last week"
          trend="up"
        />
      </div>

      {/* Main Content Grid */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left Column - Ticket Pipeline */}
        <div className="lg:col-span-2 space-y-6">
          {/* In Progress */}
          {inProgressTickets.length > 0 && (
            <section>
              <SectionHeader 
                title="In Progress" 
                count={inProgressTickets.length}
                action={<span className="text-xs text-zinc-500 dark:text-zinc-400">Clankers working</span>}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                {inProgressTickets.map(ticket => (
                  <TicketCard key={ticket.id} ticket={ticket} project={project!} />
                ))}
              </div>
            </section>
          )}

          {/* Open Issues */}
          {openTickets.length > 0 && (
            <section>
              <SectionHeader 
                title="Awaiting Assignment" 
                count={openTickets.length}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                {openTickets.map(ticket => (
                  <TicketCard key={ticket.id} ticket={ticket} project={project!} />
                ))}
              </div>
            </section>
          )}

          {/* Recently Resolved */}
          {resolvedTickets.length > 0 && (
            <section>
              <SectionHeader 
                title="Recently Resolved" 
                count={resolvedTickets.length}
              />
              <div className="grid sm:grid-cols-2 gap-3">
                {resolvedTickets.map(ticket => (
                  <TicketCard key={ticket.id} ticket={ticket} project={project!} />
                ))}
              </div>
            </section>
          )}

          {/* Job Queue */}
          {(activeJobs.length > 0 || queuedJobs.length > 0) && (
            <section>
              <SectionHeader
                title="Job Queue"
                count={jobs.length}
                action={<Link href={`/project/${project}/jobs`} className="text-xs text-brand-burnt-orange hover:underline">View all</Link>}
              />
              <div className="space-y-2">
                {activeJobs.map(job => (
                  <JobCard key={job.jobId} job={job} />
                ))}
                {queuedJobs.slice(0, 2).map(job => (
                  <JobCard key={job.jobId} job={job} />
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Right Column - Clanker Fleet */}
        <div className="space-y-6">
          <section>
            <SectionHeader 
              title="Clanker Fleet" 
              count={clankers.length}
              action={<Link href="/clankers" className="text-xs text-brand-burnt-orange hover:underline">Manage</Link>}
            />
            <div className="space-y-2">
              {clankers.map(clanker => (
                <ClankerCard key={clanker.id} clanker={clanker} />
              ))}
            </div>
            {clankers.length === 0 && (
              <div className="rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 p-6 text-center">
                <p className="text-sm text-zinc-500 dark:text-zinc-400">No active Clankers</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1">The fleet is dormant</p>
              </div>
            )}
          </section>

          {/* Quick Stats */}
          <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-950 dark:to-zinc-900 p-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">Severity Breakdown</h3>
            <div className="space-y-3">
              {stats && Object.entries(stats.bySeverity).map(([severity, count]) => {
                const severityInfo = formatSeverity(severity)
                const total = stats.total || 1
                const percentage = Math.round((count / total) * 100)
                
                return (
                  <div key={severity} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-zinc-500 dark:text-zinc-400 capitalize">{severity}</div>
                    <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full ${severityInfo.color.replace('bg-', 'bg-opacity-60 bg-').replace('text-', '')}`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="w-8 text-xs text-right text-zinc-700 dark:text-zinc-300">{count}</div>
                  </div>
                )
              })}
            </div>
          </section>

          {/* Category Distribution */}
          {stats && Object.keys(stats.byCategory).length > 0 && (
            <section className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white uppercase tracking-wider mb-4">Categories</h3>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.byCategory).slice(0, 6).map(([category, count]) => (
                  <div key={category} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs">
                    <span className="text-zinc-700 dark:text-zinc-300">{category}</span>
                    <span className="text-zinc-400 dark:text-zinc-500">{count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
