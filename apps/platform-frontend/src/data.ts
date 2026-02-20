import {
  getClankerBySlug as apiGetClankerBySlug,
  getClankers as apiGetClankers,
  getDeploymentStrategies as apiGetDeploymentStrategies,
} from '@/service/api/clanker-api'
import {
  getJob as apiGetJob,
  getJobQueueStats as apiGetJobQueueStats,
  getJobs as apiGetJobs,
  type JobListItem,
  type JobQueueStats,
  type JobStatus,
} from '@/service/api/job-api'
import { getProjectBySlug as apiGetProjectBySlug, getProjects as apiGetProjects } from '@/service/api/project-api'
import {
  getTicketStats as apiGetTicketStats,
  getTicket,
  getTickets,
} from '@/service/api/ticket-api'
import type {
  AutoFixStatus,
  Clanker,
  ClankerStatus,
  DeploymentStrategy,
  Project,
  Severity,
  Ticket,
  TicketStats,
} from '@viberglass/types'

// Extended ticket with computed status for UI
export interface TicketSummary {
  id: string
  projectId: string
  title: string
  severity: Severity
  category: string
  timestamp: string
  externalTicketId?: string
  ticketSystem: string
  autoFixStatus?: AutoFixStatus
  status: 'open' | 'resolved' | 'in_progress'
}

// Project functions
export async function getProjectsList(): Promise<Project[]> {
  return await apiGetProjects()
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return await apiGetProjectBySlug(slug)
}

// Ticket functions
export async function getRecentTickets(projectSlug?: string): Promise<TicketSummary[]> {
  const tickets = await getTickets({ projectSlug, limit: 10 })
  return tickets.map((ticket) => ({
    id: ticket.id,
    projectId: ticket.projectId,
    title: ticket.title,
    severity: ticket.severity,
    category: ticket.category,
    timestamp: ticket.timestamp,
    externalTicketId: ticket.externalTicketId,
    ticketSystem: ticket.ticketSystem,
    autoFixStatus: ticket.autoFixStatus,
    status: ticket.externalTicketId || ticket.autoFixStatus === 'completed' ? 'resolved' : ticket.autoFixStatus === 'in_progress' ? 'in_progress' : 'open',
  }))
}

export async function getTicketDetails(id: string): Promise<Ticket | null> {
  return await getTicket(id)
}

// Clanker functions
export async function getClankersList(): Promise<Clanker[]> {
  return await apiGetClankers()
}

export async function getClankerBySlug(slug: string): Promise<Clanker | null> {
  return await apiGetClankerBySlug(slug)
}

export async function getDeploymentStrategiesList(): Promise<DeploymentStrategy[]> {
  return await apiGetDeploymentStrategies()
}

export async function getTicketStats(projectSlug?: string): Promise<TicketStats> {
  return await apiGetTicketStats({ projectSlug })
}

// Job functions
export async function getRecentJobs(): Promise<JobListItem[]> {
  const response = await apiGetJobs({ limit: 5 })
  return response.jobs
}

export async function getProjectJobs(projectSlug: string, limit: number = 50): Promise<JobListItem[]> {
  const response = await apiGetJobs({ projectSlug, limit })
  return response.jobs
}

export async function getJobQueueStats(): Promise<JobQueueStats> {
  return await apiGetJobQueueStats()
}

export async function getJobDetails(jobId: string): Promise<JobStatus | null> {
  try {
    return await apiGetJob(jobId)
  } catch {
    return null
  }
}

// Re-export formatting utilities for backward compatibility
export * from './lib/formatters'

// Re-export types for convenience
export type {
  AutoFixStatus,
  Clanker,
  ClankerStatus,
  DeploymentStrategy,
  JobListItem,
  JobQueueStats,
  JobStatus,
  Project,
  Severity,
  Ticket,
  TicketStats,
}
