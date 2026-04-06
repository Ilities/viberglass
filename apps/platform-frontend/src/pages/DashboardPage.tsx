import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { AsciiGalaxy, AsciiRobot, AsciiSpaceship, AsciiWhale } from '@/components/retro-decorations'
import { Timestamp } from '@/components/timestamp'
import type { Clanker, JobListItem, JobQueueStats, Project, TicketStats, TicketSummary } from '@/data'
import {
  formatJobKind,
  formatJobStatus,
  formatSeverity,
  getClankersList,
  getJobQueueStats,
  getProjectsList,
  getRecentJobs,
  getRecentTickets,
  getTicketStats,
} from '@/data'
import { EmptyBay } from '@/pages/dashboard/EmptyBay'
import { ProjectConstellationCard } from '@/pages/dashboard/ProjectConstellationCard'
import { clankerStatusColor, getBroadcastLine } from '@/pages/dashboard/projectSignals'
import type { FeedItem, ProjectActivity } from '@/pages/dashboard/types'
import { PlusIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useState } from 'react'

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
      <div className="text-xs text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className="mt-1 text-xl font-semibold text-zinc-950 dark:text-white">{value}</div>
    </div>
  )
}

export function DashboardPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [ticketStats, setTicketStats] = useState<TicketStats | null>(null)
  const [recentTickets, setRecentTickets] = useState<TicketSummary[]>([])
  const [recentJobs, setRecentJobs] = useState<JobListItem[]>([])
  const [queueStats, setQueueStats] = useState<JobQueueStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      const [projectData, clankerData, ticketStatsData, ticketData, jobData, queueData] = await Promise.all([
        getProjectsList(),
        getClankersList(),
        getTicketStats(),
        getRecentTickets(),
        getRecentJobs(),
        getJobQueueStats(),
      ])
      setProjects(projectData)
      setClankers(clankerData)
      setTicketStats(ticketStatsData)
      setRecentTickets(ticketData)
      setRecentJobs(jobData)
      setQueueStats(queueData)
      setIsLoading(false)
    }
    loadData()
  }, [])

  const projectMap = useMemo(() => new Map(projects.map((project) => [project.id, project])), [projects])
  const projectActivity = useMemo(() => {
    const activity = new Map<string, ProjectActivity>()

    for (const project of projects) {
      activity.set(project.id, { tickets: [], jobs: [] })
    }

    for (const ticket of recentTickets) {
      const current = activity.get(ticket.projectId)
      if (!current) continue
      current.tickets.push(ticket)
    }

    const projectBySlug = new Map(projects.map((project) => [project.slug, project.id]))
    for (const job of recentJobs) {
      if (!job.projectSlug) continue
      const projectId = projectBySlug.get(job.projectSlug)
      if (!projectId) continue
      const current = activity.get(projectId)
      if (!current) continue
      current.jobs.push(job)
    }

    return activity
  }, [projects, recentJobs, recentTickets])

  const feed = useMemo(() => {
    const ticketFeed: FeedItem[] = recentTickets
      .map<FeedItem | null>((ticket) => {
        const project = projectMap.get(ticket.projectId)
        if (!project) return null
        const severity = formatSeverity(ticket.severity)
        return {
          id: `ticket-${ticket.id}`,
          title: ticket.title,
          detail: `${project.name} • ${severity.label}`,
          timestamp: ticket.timestamp,
          href: `/project/${project.slug}/tickets/${ticket.id}`,
          kind: 'ticket',
          color: severity.badgeColor,
        }
      })
      .filter((item): item is FeedItem => item !== null)

    const jobFeed: FeedItem[] = recentJobs
      .map<FeedItem | null>((job) => {
        if (!job.projectSlug) return null
        const status = formatJobStatus(job.status)
        return {
          id: `job-${job.jobId}`,
          title: job.ticket?.title ?? job.task,
          detail: `${job.projectSlug} • ${formatJobKind(job.jobKind)} • ${status.label}`,
          timestamp: job.createdAt,
          href: `/project/${job.projectSlug}/jobs/${job.jobId}`,
          kind: 'job',
          color: status.color,
        }
      })
      .filter((item): item is FeedItem => item !== null)

    return [...ticketFeed, ...jobFeed]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10)
  }, [projectMap, recentJobs, recentTickets])

  if (isLoading) return <FunLoading retro />

  const activeClankers = clankers.filter((clanker) => clanker.status === 'active').length
  const queuePressure = (queueStats?.waiting ?? 0) + (queueStats?.active ?? 0)
  const broadcast = getBroadcastLine(projects.length, clankers.length)
  const hasSparseConstellation = projects.length <= 3

  return (
    <>
      <PageMeta title="Command Deck" />
      <Heading>Command Deck</Heading>
      <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">{broadcast}</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Project Constellation" value={projects.length} />
        <MetricCard label="Unresolved Bugs" value={ticketStats?.open ?? 0} />
        <MetricCard label="Queue Pressure" value={queuePressure} />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <Subheading>Project Constellation</Subheading>
        <div className="flex items-center gap-2">
          <Button href="/new" color="brand">
            <PlusIcon data-slot="icon" />
            New Project
          </Button>
          <Link href="/clankers" className="ui-text-action">
            Manage Clankers
          </Link>
        </div>
      </div>
      <Divider className="mt-2" />

      {projects.length === 0 ? (
        <div className="mt-4">
          <EmptyBay
            title="[ MOSTLY HARMLESS ]"
            description="No projects in orbit yet. Launch one and this deck turns into a proper space opera. Bring a towel."
            asciiArt={<AsciiSpaceship />}
            href="/new"
            actionLabel="Launch Project"
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project, index) => (
            <ProjectConstellationCard
              key={project.id}
              project={project}
              activity={projectActivity.get(project.id) ?? { tickets: [], jobs: [] }}
              delayIndex={index}
              showWhisper={hasSparseConstellation}
            />
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.8fr_1fr]">
        <div>
          <Subheading>Galactic Logbook</Subheading>
          {feed.length === 0 ? (
            <div className="mt-4">
              <EmptyBay
                title="[ STARS ARE QUIET ]"
                description="No ticket pings or job thruster trails yet. That calm will not last. The dolphins tried to warn us."
                asciiArt={<AsciiWhale />}
              />
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              {feed.map((item) => (
                <Link
                  key={item.id}
                  href={item.href}
                  className="hover-lift flex items-center justify-between gap-4 rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge color={item.color}>{item.kind === 'ticket' ? 'Ticket' : 'Job'}</Badge>
                      <span className="truncate text-sm font-medium text-zinc-950 dark:text-white">{item.title}</span>
                    </div>
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{item.detail}</p>
                  </div>
                  <Timestamp
                    date={item.timestamp}
                    className="text-xs whitespace-nowrap text-zinc-500 dark:text-zinc-400"
                  />
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-8">
          <div>
            <Subheading>Mechanical Menagerie</Subheading>
            {clankers.length === 0 ? (
              <div className="mt-4">
                <EmptyBay
                  title="[ NO TIN COMPANIONS ]"
                  description="Your loyal clankers have not yet been assembled. Even Marvin started somewhere."
                  asciiArt={<AsciiRobot />}
                  href="/clankers/new"
                  actionLabel="Assemble Clanker"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {clankers.slice(0, 5).map((clanker) => (
                  <Link
                    key={clanker.id}
                    href={`/clankers/${clanker.slug}`}
                    className="hover-lift flex items-center gap-3 rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <Avatar
                      initials={clanker.name.substring(0, 2).toUpperCase()}
                      className="bg-brand-gradient size-9 text-brand-charcoal"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{clanker.name}</div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {clanker.description || 'Awaiting dramatic backstory'}
                      </div>
                    </div>
                    <Badge color={clankerStatusColor[clanker.status]}>{clanker.status}</Badge>
                  </Link>
                ))}
                <Link href="/clankers" className="ui-text-action">
                  View All Clankers
                </Link>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <Subheading>Deck Mood</Subheading>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
              {activeClankers > 0
                ? `Crew alert: ${activeClankers} clanker${activeClankers === 1 ? '' : 's'} standing by for chaos. Share and Enjoy.`
                : 'Crew alert: nobody is on duty yet. Marvin would call this "a waste of consciousness."'}
            </p>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Ticket radar: {ticketStats?.open ?? 0} open across the constellation
              {(ticketStats?.open ?? 0) > 10 ? '. That is, in fact, a lot. Even by galactic standards.' : '.'}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 text-zinc-400 dark:text-zinc-500">
        <AsciiGalaxy />
      </div>
    </>
  )
}
