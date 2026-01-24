import {
  getClankerBySlug as apiGetClankerBySlug,
  getClankers as apiGetClankers,
  getDeploymentStrategies as apiGetDeploymentStrategies,
} from '@/service/api/clanker-api'
import { getProjectBySlug as apiGetProjectBySlug, getProjects as apiGetProjects } from '@/service/api/project-api'
import { getTickets } from '@/service/api/ticket-api'
import type {
  AutoFixStatus,
  Clanker,
  ClankerStatus,
  DeploymentStrategy,
  Project,
  Severity,
  Ticket,
} from '@viberglass/types'

// Extended ticket with computed status for UI
export interface TicketSummary {
  id: string
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
    title: ticket.title,
    severity: ticket.severity,
    category: ticket.category,
    timestamp: ticket.timestamp,
    externalTicketId: ticket.externalTicketId,
    ticketSystem: ticket.ticketSystem,
    autoFixStatus: ticket.autoFixStatus,
    status: ticket.externalTicketId ? 'resolved' : ticket.autoFixStatus === 'in_progress' ? 'in_progress' : 'open',
  }))
}

export async function getTicketDetails(id: string): Promise<Ticket | null> {
  const { getTicket } = await import('@/service/api/ticket-api')
  return await getTicket(id)
}

export async function triggerAutoFix(ticketId: string, ticketSystem: string, repositoryUrl?: string): Promise<void> {
  const { triggerAutoFix: apiTriggerAutoFix } = await import('@/service/api/ticket-api')
  await apiTriggerAutoFix(ticketId, ticketSystem, repositoryUrl)
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

// TODO: Implement stats API endpoint - returns placeholder structure until backend is ready
export async function getTicketStats() {
  // Placeholder until real API endpoint exists
  return {
    total: 0,
    open: 0,
    resolved: 0,
    inProgress: 0,
    bySeverity: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    },
    byCategory: {},
    autoFixStats: {
      requested: 0,
      completed: 0,
      pending: 0,
      failed: 0,
    },
  }
}

// Re-export formatting utilities for backward compatibility
export * from './lib/formatters'

// Re-export types for convenience
export type { AutoFixStatus, Clanker, ClankerStatus, DeploymentStrategy, Project, Severity, Ticket }
