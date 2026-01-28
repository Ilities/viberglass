import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Divider } from '@/components/divider'
import { Heading, Subheading } from '@/components/heading'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
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
import type { ClankerStatus } from '@viberglass/types'
import { PlusIcon } from '@radix-ui/react-icons'
import Link from 'next/link'

function DashboardStat({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div>
      <Divider />
      <div className="mt-6 text-lg/6 font-medium text-zinc-950 sm:text-sm/6 dark:text-white">{title}</div>
      <div className="mt-3 text-3xl/8 font-semibold text-zinc-950 sm:text-2xl/8 dark:text-white">{value}</div>
      {subtitle && (
        <div className="mt-3 text-sm/6 text-zinc-500 sm:text-xs/6 dark:text-zinc-400">{subtitle}</div>
      )}
    </div>
  )
}

function EmptyState({ title, description, href, actionLabel }: { title: string; description: string; href: string; actionLabel: string }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="text-sm font-semibold text-zinc-950 dark:text-white">{title}</h3>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{description}</p>
      <Button href={href} color="brand" className="mt-4">
        <PlusIcon data-slot="icon" />
        {actionLabel}
      </Button>
    </div>
  )
}

export default async function DashboardPage() {
  const [projects, clankers, ticketStats, recentTickets, recentJobs, queueStats] = await Promise.all([
    getProjectsList(),
    getClankersList(),
    getTicketStats(),
    getRecentTickets(),
    getRecentJobs(),
    getJobQueueStats(),
  ])

  const activeClankers = clankers.filter((c) => c.status === 'active')
  const projectMap = new Map(projects.map((p) => [p.id, p]))

  const clankerStatusColor: Record<ClankerStatus, 'green' | 'red' | 'blue' | 'zinc'> = {
    active: 'green',
    inactive: 'zinc',
    deploying: 'blue',
    failed: 'red',
  }

  return (
    <>
      {/* Header */}
      <Heading>Dashboard</Heading>

      {/* Summary stats */}
      <div className="mt-8 grid gap-8 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStat title="Total Projects" value={projects.length.toString()} />
        <DashboardStat
          title="Total Tickets"
          value={ticketStats.total.toString()}
          subtitle={`${ticketStats.open} open`}
        />
        <DashboardStat
          title="Active Clankers"
          value={activeClankers.length.toString()}
          subtitle={`${clankers.length} total`}
        />
        <DashboardStat
          title="Job Queue"
          value={(queueStats.waiting + queueStats.active).toString()}
          subtitle={`${queueStats.waiting} queued, ${queueStats.active} running`}
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
                  title="No projects yet"
                  description="Create your first project to start tracking bugs."
                  href="/new"
                  actionLabel="Create Project"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {projects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/project/${project.slug}`}
                    className="flex items-center gap-4 rounded-lg border border-zinc-950/10 bg-white p-4 transition-colors hover:border-brand-burnt-orange/30 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
                  >
                    <Avatar
                      initials={project.name.substring(0, 2).toUpperCase()}
                      className="bg-brand-gradient size-10 text-brand-charcoal"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-zinc-950 dark:text-white">{project.name}</div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {project.ticketSystem.charAt(0).toUpperCase() + project.ticketSystem.slice(1)} &middot;{' '}
                        Auto-fix {project.autoFixEnabled ? 'on' : 'off'}
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
                  title="No clankers yet"
                  description="Create a clanker to coordinate automated tasks."
                  href="/clankers/new"
                  actionLabel="Create Clanker"
                />
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {clankers.map((clanker) => (
                  <Link
                    key={clanker.id}
                    href={`/clankers/${clanker.slug}`}
                    className="flex items-center gap-4 rounded-lg border border-zinc-950/10 bg-white p-4 transition-colors hover:border-brand-burnt-orange/30 dark:border-white/10 dark:bg-zinc-900 dark:hover:border-brand-burnt-orange/30"
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
                  title="No tickets yet"
                  description="Tickets will appear here once your projects start receiving them."
                  href="/new"
                  actionLabel="Create Project"
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
                          <Badge color={ticket.severity === 'critical' ? 'red' : ticket.severity === 'high' ? 'orange' : ticket.severity === 'medium' ? 'amber' : 'green'}>
                            {severityInfo.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-zinc-500 dark:text-zinc-400">
                          {project?.name ?? '—'}
                        </TableCell>
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
                  title="No jobs yet"
                  description="Jobs will appear here when auto-fix tasks are triggered."
                  href="/new"
                  actionLabel="Create Project"
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
                    return (
                      <TableRow key={job.jobId} href={`/jobs/${job.jobId}`} title={`Job ${job.jobId}`}>
                        <TableCell>
                          <Badge color={statusInfo.color}>{statusInfo.label}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">
                          {job.repository}
                        </TableCell>
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
