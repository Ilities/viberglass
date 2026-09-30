import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { EmptyState } from '@/components/empty-state'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { Timestamp } from '@/components/timestamp'
import { useAuth } from '@/context/auth-context'
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
import { SpaceCard } from '@/pages/dashboard/SpaceCard'
import { clankerStatusColor, getWorkspaceSummary } from '@/pages/dashboard/spaceSignals'
import { useSetupRedirect } from '@/pages/setup/useSetupRedirect'
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
  useSetupRedirect()
  const { user } = useAuth()
  const isAdmin = user?.role === 'admin'
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
          href: `/spaces/${project.slug}/tasks/${ticket.id}`,
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
          href: `/spaces/${job.projectSlug}/runs/${job.jobId}`,
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

  const runsInProgress = (queueStats?.waiting ?? 0) + (queueStats?.active ?? 0)
  const openTaskCount = (ticketStats?.open ?? 0) + (ticketStats?.inProgress ?? 0) + (ticketStats?.inReview ?? 0)

  return (
    <>
      <PageMeta title="Dashboard" />
      <Heading>Dashboard</Heading>
      <p className="mt-2 max-w-3xl text-sm text-zinc-500 dark:text-zinc-400">
        {getWorkspaceSummary(projects.length, openTaskCount, runsInProgress)}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <MetricCard label="Spaces" value={projects.length} />
        <MetricCard label="Open tasks" value={openTaskCount} />
        <MetricCard label="Runs in progress" value={runsInProgress} />
      </div>

      <div className="mt-10 flex items-center justify-between">
        <Subheading>Spaces</Subheading>
        <div className="flex items-center gap-2">
          <Button href="/spaces/new" color="brand">
            <PlusIcon data-slot="icon" />
            New space
          </Button>
        </div>
      </div>
      <Divider className="mt-2" />

      {projects.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No spaces yet"
            description="A space connects a repository to the tasks and agents that work on it."
action={
              <Button href="/spaces/new" color="brand">
                <PlusIcon data-slot="icon" />
                Create a space
              </Button>
            }
          />
        </div>
      ) : (
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <SpaceCard
              key={project.id}
              project={project}
              activity={projectActivity.get(project.id) ?? { tickets: [], jobs: [] }}
            />
          ))}
        </div>
      )}

      <div className="mt-10 grid gap-8 xl:grid-cols-[1.8fr_1fr]">
        <div>
          <Subheading>Recent activity</Subheading>
          {feed.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No activity yet" description="Tasks and runs show up here as they happen." />
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
                      <Badge color={item.color}>{item.kind === 'ticket' ? 'Task' : 'Run'}</Badge>
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
            <Subheading>Agents</Subheading>
            {clankers.length === 0 ? (
              <div className="mt-4">
                {isAdmin ? (
                  <EmptyState
                    title="No agents yet"
                    description="An agent works on tasks for you. Setup creates one; engineers can add more under Settings → Advanced."
action={
              <Button href="/setup" color="brand">
                <PlusIcon data-slot="icon" />
                Set up an agent
              </Button>
            }
                  />
                ) : (
                  <EmptyState title="No agents yet" description="An agent works on tasks for you. Ask an admin to set one up." />
                )}
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {clankers.slice(0, 5).map((clanker) => (
                  <Link
                    key={clanker.id}
                    href={`/settings/agents/${clanker.slug}`}
                    className="hover-lift flex items-center gap-3 rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900"
                  >
                    <Avatar
                      initials={clanker.name.substring(0, 2).toUpperCase()}
                      className="bg-brand-gradient size-9 text-brand-charcoal"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-zinc-950 dark:text-white">{clanker.name}</div>
                      <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {clanker.description || clanker.agent || 'No description'}
                      </div>
                    </div>
                    <Badge color={clankerStatusColor[clanker.status]}>{clanker.status}</Badge>
                  </Link>
                ))}
                <Link href="/settings/agents" className="ui-text-action">
                  View all agents
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
