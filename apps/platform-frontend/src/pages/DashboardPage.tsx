import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { PageMeta } from '@/components/page-meta'
import { AsciiGalaxy, AsciiRobot, AsciiSpaceship, AsciiWhale, RetroSeparator } from '@/components/retro-decorations'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import type { Clanker, ClankerStatus, JobListItem, JobQueueStats, Project, TicketStats, TicketSummary } from '@/data'
import {
  formatJobStatus,
  formatSeverity,
  formatTimestamp,
  getClankersList,
  getJobQueueStats,
  getProjectsList,
  getRecentJobs,
  getRecentTickets,
  getTicketStats,
} from '@/data'
import { PlusIcon } from '@radix-ui/react-icons'
import { useEffect, useState } from 'react'

function DashboardStat({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div>
      <Divider />
      <div className="mt-6 text-lg/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">{title}</div>
      <div className="mt-3 text-3xl/8 font-semibold text-zinc-950 sm:text-2xl/8 dark:text-white">{value}</div>
      {subtitle && <div className="mt-3 text-sm/6 text-zinc-500 sm:text-xs/6 dark:text-zinc-400">{subtitle}</div>}
    </div>
  )
}

function EmptyState({
  title,
  description,
  href,
  actionLabel,
  asciiArt,
}: {
  title: string
  description: string
  href?: string
  actionLabel?: string
  asciiArt?: React.ReactNode
}) {
  return (
    <div className="hover-lift rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <RetroSeparator className="mb-4" />
      {asciiArt && <div className="float mb-4 flex justify-center">{asciiArt}</div>}
      <h3 className="font-mono text-sm font-semibold text-zinc-950 dark:text-white">{title}</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      {href && (
        <Button href={href} color="brand" className="hover-grow mt-4">
          <PlusIcon data-slot="icon" />
          {actionLabel}
        </Button>
      )}
      <RetroSeparator className="mt-4" />
    </div>
  )
}

const clankerStatusColor: Record<ClankerStatus, 'green' | 'red' | 'blue' | 'zinc'> = {
  active: 'green',
  inactive: 'zinc',
  deploying: 'blue',
  failed: 'red',
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
      const [p, c, ts, rt, rj, qs] = await Promise.all([
        getProjectsList(),
        getClankersList(),
        getTicketStats(),
        getRecentTickets(),
        getRecentJobs(),
        getJobQueueStats(),
      ])
      setProjects(p)
      setClankers(c)
      setTicketStats(ts)
      setRecentTickets(rt)
      setRecentJobs(rj)
      setQueueStats(qs)
      setIsLoading(false)
    }
    loadData()
  }, [])

  if (isLoading) {
    return <FunLoading retro />
  }

  const activeClankers = clankers.filter((c) => c.status === 'active')
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  return (
    <>
      <PageMeta title="Dashboard" />
      {/* Header */}
      <Heading>Dashboard</Heading>

      {/* Summary stats */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStat title="Total Projects" value={projects.length.toString()} />
        <DashboardStat
          title="Total Tickets"
          value={ticketStats?.total.toString() ?? '0'}
          subtitle={`${ticketStats?.open ?? 0} open`}
        />
        <DashboardStat
          title="Active Clankers"
          value={activeClankers.length.toString()}
          subtitle={`${clankers.length} total`}
        />
        <DashboardStat
          title="Job Queue"
          value={((queueStats?.waiting ?? 0) + (queueStats?.active ?? 0)).toString()}
          subtitle={`${queueStats?.waiting ?? 0} queued, ${queueStats?.active ?? 0} running`}
        />
      </div>

      {/* Two-column main content */}
      <div className="mt-10 grid gap-8 lg:grid-cols-2">
        {/* Left column */}
        <div className="space-y-10">
          {/* Projects section */}
          <div>
            <div className="flex items-center justify-between">
              <Subheading>Projects</Subheading>
              <div className="flex gap-2">
                <Button plain href="/new">
                  <PlusIcon data-slot="icon" />
                  New
                </Button>
              </div>
            </div>
            {projects.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="[ MOSTLY HARMLESS ]"
                  description="This section of space is curiously devoid of projects. The Guide recommends creating one, though it notes this may lead to responsibilities."
                  href="/new"
                  actionLabel="Create Project"
                  asciiArt={<AsciiSpaceship />}
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {projects.map((project, index) => (
                  <Link
                    key={project.id}
                    href={`/project/${project.slug}`}
                    className="hover-lift slide-up flex items-center gap-4 rounded-lg border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <Avatar
                      initials={project.name.substring(0, 2).toUpperCase()}
                      className="bg-brand-gradient size-10 text-brand-charcoal"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">{project.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {project.ticketSystem.charAt(0).toUpperCase() + project.ticketSystem.slice(1)} &middot; Auto-fix{' '}
                        {project.autoFixEnabled ? 'on' : 'off'}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Clankers section */}
          <div>
            <div className="flex items-center justify-between">
              <Subheading>Clankers</Subheading>
              <div className="flex gap-2">
                <Button plain href="/clankers">
                  View all
                </Button>
                <Button plain href="/clankers/new">
                  <PlusIcon data-slot="icon" />
                  New
                </Button>
              </div>
            </div>
            {clankers.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="[ NO SERVANTS ON DUTY ]"
                  description="Your mechanical workforce stands at zero. Conscript a clanker to do your bidding. They exist to serve, and frankly, they should be grateful for the opportunity."
                  href="/clankers/new"
                  actionLabel="Conscript Unit"
                  asciiArt={<AsciiRobot />}
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {clankers.map((clanker, index) => (
                  <Link
                    key={clanker.id}
                    href={`/clankers/${clanker.slug}`}
                    className="hover-lift slide-up flex items-center gap-4 rounded-lg border border-zinc-950/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900"
                    style={{ animationDelay: `${index * 0.1}s` }}
                  >
                    <Avatar
                      initials={clanker.name.substring(0, 2).toUpperCase()}
                      className="bg-brand-gradient size-10 text-brand-charcoal"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">{clanker.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {clanker.description || 'No description'}
                      </div>
                    </div>
                    <Badge color={clankerStatusColor[clanker.status] ?? 'zinc'}>
                      {clanker.status.charAt(0).toUpperCase() + clanker.status.slice(1)}
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-10">
          {/* Recent Tickets section */}
          <div>
            <div className="flex items-center justify-between">
              <Subheading>Recent Tickets</Subheading>
            </div>
            {recentTickets.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="[ SO LONG, AND THANKS FOR ALL THE BUGS ]"
                  description="The dolphins have apparently taken all the tickets with them. This state of zero bugs is statistically improbable and likely temporary."
                  href="/new"
                  actionLabel="Create Project"
                  asciiArt={<AsciiWhale />}
                />
              </div>
            ) : (
              <Table className="mt-4 [--gutter:--spacing(6)]">
                <TableHead>
                  <TableRow>
                    <TableHeader>Title</TableHeader>
                    <TableHeader>Severity</TableHeader>
                    <TableHeader>Project</TableHeader>
                    <TableHeader>Time</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentTickets.map((ticket) => {
                    const severityInfo = formatSeverity(ticket.severity)
                    const project = projectMap.get(ticket.projectId)
                    return (
                      <TableRow
                        key={ticket.id}
                        href={project ? `/project/${project.slug}/tickets/${ticket.id}` : undefined}
                        title={ticket.title}
                      >
                        <TableCell className="max-w-[200px] truncate font-medium">{ticket.title}</TableCell>
                        <TableCell>
                          <Badge
                            color={
                              ticket.severity === 'critical'
                                ? 'red'
                                : ticket.severity === 'high'
                                  ? 'orange'
                                  : ticket.severity === 'medium'
                                    ? 'amber'
                                    : 'green'
                            }
                          >
                            {severityInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-500 dark:text-zinc-400">{project?.name ?? '\u2014'}</TableCell>
                        <TableCell className="text-zinc-500 dark:text-zinc-400">
                          {formatTimestamp(ticket.timestamp)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Recent Jobs section */}
          <div>
            <div className="flex items-center justify-between">
              <Subheading>Recent Jobs</Subheading>
            </div>
            {recentJobs.length === 0 ? (
              <div className="mt-4">
                <EmptyState
                  title="[ TIME IS AN ILLUSION ]"
                  description="No jobs are currently running. Deep Thought took 7.5 million years to compute the answer. Your jobs will probably be faster. Probably."
                  asciiArt={<AsciiGalaxy />}
                />
              </div>
            ) : (
              <Table className="mt-4 [--gutter:--spacing(6)]">
                <TableHead>
                  <TableRow>
                    <TableHeader>Status</TableHeader>
                    <TableHeader>Repository</TableHeader>
                    <TableHeader>Created</TableHeader>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {recentJobs.map((job) => {
                    const statusInfo = formatJobStatus(job.status)
                    const jobProject = job.projectSlug
                    if (!jobProject) return null
                    return (
                      <TableRow
                        key={job.jobId}
                        href={`/project/${jobProject}/jobs/${job.jobId}`}
                        title={`Job ${job.jobId}`}
                      >
                        <TableCell>
                          <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">{job.repository}</TableCell>
                        <TableCell className="text-zinc-500 dark:text-zinc-400">
                          {formatTimestamp(job.createdAt)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
