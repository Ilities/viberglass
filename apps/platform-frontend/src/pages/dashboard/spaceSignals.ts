import type { JobListItem, Project, TicketSummary } from '@/data'
import { formatJobStatus, formatTimestamp } from '@/data'
import type { SignalColor, SpaceSignal } from '@/pages/dashboard/types'
import { TICKET_STATUS } from '@viberglass/types'

function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`
}

/** One line under the dashboard heading: how much there is and whether anything runs. */
export function getWorkspaceSummary(spaceCount: number, openTaskCount: number, runsInProgress: number): string {
  const running = runsInProgress > 0 ? `${count(runsInProgress, 'run')} in progress` : 'nothing running'
  return `${count(spaceCount, 'space')} · ${count(openTaskCount, 'open task')} · ${running}`
}

/** The most pressing thing about a space, in the order someone would deal with it. */
export function getSpaceSignal(
  project: Pick<Project, 'slug' | 'primaryScmIntegrationId' | 'scmConfig'>,
  tickets: Pick<TicketSummary, 'status'>[],
  jobs: Pick<JobListItem, 'status' | 'repository'>[]
): SpaceSignal {
  const hasScmConfig = Boolean(project.primaryScmIntegrationId || project.scmConfig?.sourceRepository)
  const hasObservedRepositoryFlow = jobs.some((job) => job.repository.trim().length > 0)
  const openTasks = tickets.filter((ticket) => ticket.status !== TICKET_STATUS.RESOLVED).length
  const failedRuns = jobs.filter((job) => job.status === 'failed').length
  const activeRuns = jobs.filter((job) => job.status === 'active' || job.status === 'queued').length

  if (!hasScmConfig && !hasObservedRepositoryFlow) {
    return {
      summary: 'No repository connected yet.',
      color: 'orange',
      action: { href: `/spaces/${project.slug}/settings/general`, label: 'Connect repository' },
    }
  }
  if (failedRuns > 0) {
    return {
      summary: `${count(failedRuns, 'recent run')} failed.`,
      color: 'red',
      action: { href: `/spaces/${project.slug}/runs`, label: 'View runs' },
    }
  }
  if (activeRuns > 0) {
    return {
      summary: `${count(activeRuns, 'run')} in progress.`,
      color: 'blue',
      action: { href: `/spaces/${project.slug}/runs`, label: 'View runs' },
    }
  }
  if (openTasks > 0) {
    return {
      summary: `${count(openTasks, 'open task')}.`,
      color: 'amber',
      action: { href: `/spaces/${project.slug}/tasks`, label: 'View tasks' },
    }
  }
  return { summary: 'Nothing needs attention.', color: 'green' }
}

/** The newest task or run in a space, or null when it has none. */
type ActivityTicket = Pick<TicketSummary, 'title' | 'timestamp'>
type ActivityJob = Pick<JobListItem, 'status' | 'createdAt'>

export function getLastActivity(tickets: ActivityTicket[], jobs: ActivityJob[]): string | null {
  const latestTicket = tickets[0]
  const latestJob = jobs[0]
  const describeTicket = (ticket: ActivityTicket) => `Last activity: task "${ticket.title}".`
  const describeJob = (job: ActivityJob) =>
    `Last activity: run ${formatJobStatus(job.status).label.toLowerCase()} ${formatTimestamp(job.createdAt)}.`

  if (latestTicket && latestJob) {
    return new Date(latestTicket.timestamp).getTime() >= new Date(latestJob.createdAt).getTime()
      ? describeTicket(latestTicket)
      : describeJob(latestJob)
  }
  if (latestTicket) return describeTicket(latestTicket)
  if (latestJob) return describeJob(latestJob)
  return null
}

export const clankerStatusColor: Record<'active' | 'inactive' | 'deploying' | 'failed', SignalColor> = {
  active: 'green',
  inactive: 'zinc',
  deploying: 'blue',
  failed: 'red',
}
