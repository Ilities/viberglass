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
import { getTicket } from '@/service/api/ticket-api'
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

// Project functions
export async function getProjectsList(): Promise<Project[]> {
  return await apiGetProjects()
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  return await apiGetProjectBySlug(slug)
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
