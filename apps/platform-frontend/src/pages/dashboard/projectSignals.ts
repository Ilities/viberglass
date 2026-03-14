import type { JobListItem, Project, TicketSummary } from '@/data'
import { formatJobStatus, formatTimestamp } from '@/data'
import type { ProjectSignal, SignalColor } from '@/pages/dashboard/types'
import { TICKET_STATUS } from '@viberglass/types'

export function getBroadcastLine(projectCount: number, clankerCount: number): string {
  const messages = [
    'Cosmic weather is mild. Ideal conditions for shipping improbable fixes.',
    'The Guide recommends tea, one daring commit, and zero panic.',
    'Star charts are calibrated. Plot your next bug-hunting voyage.',
    'All systems whimsical. Responsibilities remain deeply optional.',
  ]
  const seed = new Date().getDate() + projectCount + clankerCount
  return messages[seed % messages.length]
}

export function getProjectSignal(project: Project, tickets: TicketSummary[], jobs: JobListItem[]): ProjectSignal {
  const hasNativeTicketing = project.ticketSystem === 'custom'
  const hasObservedTicketFlow = tickets.length > 0
  const hasTicketing = Boolean(project.primaryTicketingIntegrationId) || hasNativeTicketing || hasObservedTicketFlow
  const hasScmConfig = Boolean(project.primaryScmIntegrationId || project.scmConfig?.sourceRepository)
  const hasObservedRepositoryFlow = jobs.some((job) => job.repository.trim().length > 0)
  const hasScm = hasScmConfig || hasObservedRepositoryFlow
  const openTickets = tickets.filter((ticket) => ticket.status !== TICKET_STATUS.RESOLVED).length
  const failedJobs = jobs.filter((job) => job.status === 'failed').length
  const activeJobs = jobs.filter((job) => job.status === 'active' || job.status === 'queued').length

  if (!hasTicketing) {
    return {
      label: 'Uncharted',
      color: 'red',
      glyph: '[?!]',
      blurb: 'No ticketing integration yet. Reports may drift into deep space.',
      nextHref: `/project/${project.slug}/settings/integrations`,
      nextLabel: 'Wire Ticketing',
    }
  }

  if (!hasScm) {
    return {
      label: 'Mapless',
      color: 'orange',
      glyph: '[//]',
      blurb: 'Source repository missing. Automations have nowhere to dock.',
      nextHref: `/project/${project.slug}/settings/project`,
      nextLabel: 'Link Repository',
    }
  }

  if (failedJobs > 0) {
    return {
      label: 'Asteroid Field',
      color: 'red',
      glyph: '[***]',
      blurb: `${failedJobs} recent job${failedJobs === 1 ? '' : 's'} failed and need a brave pilot.`,
      nextHref: `/project/${project.slug}/jobs`,
      nextLabel: 'Inspect Jobs',
    }
  }

  if (openTickets >= 3) {
    return {
      label: 'Bug Storm',
      color: 'amber',
      glyph: '[!!!]',
      blurb: `${openTickets} unresolved tickets are currently buzzing in orbit.`,
      nextHref: `/project/${project.slug}/tickets`,
      nextLabel: 'Triage Bugs',
    }
  }

  if (activeJobs > 0) {
    return {
      label: 'Engines Warm',
      color: 'blue',
      glyph: '[>>>]',
      blurb: `${activeJobs} automation run${activeJobs === 1 ? '' : 's'} are in flight right now.`,
      nextHref: `/project/${project.slug}/jobs`,
      nextLabel: 'Track Flight',
    }
  }

  return {
    label: 'Calm Orbit',
    color: 'green',
    glyph: '[o_o]',
    blurb: 'No urgent turbulence detected. A surprisingly peaceful timeline.',
    nextHref: `/project/${project.slug}`,
    nextLabel: 'Open Project',
  }
}

export function getLatestWhisper(project: Project, tickets: TicketSummary[], jobs: JobListItem[]): string {
  const latestTicket = tickets[0]
  const latestJob = jobs[0]

  if (!latestTicket && !latestJob) return `${project.name} is quiet. Suspiciously quiet.`
  if (latestTicket && !latestJob) return `Latest whisper: ticket "${latestTicket.title}".`
  if (!latestTicket && latestJob) return `Latest whisper: ${formatJobStatus(latestJob.status).label} job from ${formatTimestamp(latestJob.createdAt)}.`

  if (!latestTicket || !latestJob) return `${project.name} is quiet. Suspiciously quiet.`
  const ticketTs = new Date(latestTicket.timestamp).getTime()
  const jobTs = new Date(latestJob.createdAt).getTime()

  return ticketTs >= jobTs
    ? `Latest whisper: ticket "${latestTicket.title}".`
    : `Latest whisper: ${formatJobStatus(latestJob.status).label} job from ${formatTimestamp(latestJob.createdAt)}.`
}

export const clankerStatusColor: Record<'active' | 'inactive' | 'deploying' | 'failed', SignalColor> = {
  active: 'green',
  inactive: 'zinc',
  deploying: 'blue',
  failed: 'red',
}
