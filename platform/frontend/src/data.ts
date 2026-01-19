import type { Ticket, Project, Severity, AutoFixStatus, Clanker, ClankerStatus, DeploymentStrategy } from '@viberator/types'
import { getTickets } from '@/service/api/ticket-api'
import { getProjects as apiGetProjects, getProjectBySlug as apiGetProjectBySlug } from '@/service/api/project-api'
import { getClankers as apiGetClankers, getClankerBySlug as apiGetClankerBySlug, getDeploymentStrategies as apiGetDeploymentStrategies } from '@/service/api/clanker-api'

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
  try {
    return await apiGetProjects()
  } catch (error) {
    console.warn('Failed to fetch projects:', error)
    return []
  }
}

export async function getProjectBySlug(slug: string): Promise<Project | null> {
  try {
    return await apiGetProjectBySlug(slug)
  } catch (error) {
    console.warn('Failed to fetch project:', error)
    return null
  }
}

// Ticket functions
export async function getRecentTickets(projectSlug?: string): Promise<TicketSummary[]> {
  try {
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
  } catch (error) {
    console.warn('Using mock data for tickets:', error)
    return getMockTickets()
  }
}

export async function getTicketDetails(id: string): Promise<Ticket | null> {
  try {
    const { getTicket } = await import('@/service/api/ticket-api')
    return await getTicket(id)
  } catch (error) {
    console.warn('Failed to fetch ticket details:', error)
    return null
  }
}

export async function getTicketStats() {
  // In a real implementation, you'd have an API endpoint for stats
  // For now, return mock stats
  return getMockTicketStats()
}

// Utility functions for ticket formatting
export function formatSeverity(severity: string): { label: string; color: string } {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: 'bg-red-100 text-red-800' }
    case 'high':
      return { label: 'High', color: 'bg-orange-100 text-orange-800' }
    case 'medium':
      return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' }
    case 'low':
      return { label: 'Low', color: 'bg-green-100 text-green-800' }
    default:
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' }
  }
}

export function formatAutoFixStatus(status?: string): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: 'Fixed', color: 'bg-green-100 text-green-800' }
    case 'in_progress':
      return { label: 'Fixing', color: 'bg-blue-100 text-blue-800' }
    case 'pending':
      return { label: 'Pending', color: 'bg-yellow-100 text-yellow-800' }
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 text-red-800' }
    default:
      return { label: 'Not Requested', color: 'bg-gray-100 text-gray-800' }
  }
}

export function formatTicketSystem(system: string): string {
  const systems: Record<string, string> = {
    github: 'GitHub',
    linear: 'Linear',
    jira: 'Jira',
    gitlab: 'GitLab',
    azure: 'Azure DevOps',
    asana: 'Asana',
    trello: 'Trello',
    monday: 'Monday',
    clickup: 'ClickUp',
  }
  return systems[system] || system
}

export function formatTimestamp(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffInHours = (now.getTime() - dateObj.getTime()) / (1000 * 60 * 60)

  if (diffInHours < 1) {
    return 'Just now'
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  } else {
    return dateObj.toLocaleDateString()
  }
}

export async function triggerAutoFix(ticketId: string, ticketSystem: string, repositoryUrl?: string): Promise<void> {
  try {
    const { triggerAutoFix: apiTriggerAutoFix } = await import('@/service/api/ticket-api')
    await apiTriggerAutoFix(ticketId, ticketSystem, repositoryUrl)
  } catch (error) {
    console.warn('Failed to trigger auto-fix:', error)
  }
}

// Mock data for development
function getMockTickets(): TicketSummary[] {
  return [
    {
      id: 'ticket-001',
      title: 'Button not clickable on mobile',
      severity: 'high',
      category: 'UI/UX',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      externalTicketId: 'ISSUE-123',
      ticketSystem: 'github',
      autoFixStatus: 'pending',
      status: 'open',
    },
    {
      id: 'ticket-002',
      title: 'Form validation error',
      severity: 'medium',
      category: 'Forms',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      externalTicketId: 'ISSUE-124',
      ticketSystem: 'linear',
      autoFixStatus: 'completed',
      status: 'resolved',
    },
    {
      id: 'ticket-003',
      title: 'Page load performance issue',
      severity: 'low',
      category: 'Performance',
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      ticketSystem: 'jira',
      status: 'in_progress',
    },
  ]
}

function getMockTicketStats() {
  return {
    total: 47,
    open: 23,
    resolved: 18,
    inProgress: 6,
    bySeverity: {
      critical: 2,
      high: 8,
      medium: 15,
      low: 22,
    },
    byCategory: {
      'UI/UX': 12,
      Forms: 8,
      Performance: 6,
      API: 5,
      Security: 3,
      Other: 13,
    },
    autoFixStats: {
      requested: 15,
      completed: 8,
      pending: 4,
      failed: 3,
    },
  }
}

// Clanker functions
export async function getClankersList(): Promise<Clanker[]> {
  try {
    return await apiGetClankers()
  } catch (error) {
    console.warn('Failed to fetch clankers:', error)
    return []
  }
}

export async function getClankerBySlug(slug: string): Promise<Clanker | null> {
  try {
    return await apiGetClankerBySlug(slug)
  } catch (error) {
    console.warn('Failed to fetch clanker:', error)
    return null
  }
}

export async function getDeploymentStrategiesList(): Promise<DeploymentStrategy[]> {
  try {
    return await apiGetDeploymentStrategies()
  } catch (error) {
    console.warn('Failed to fetch deployment strategies:', error)
    return []
  }
}

// Utility functions for clanker formatting
export function formatClankerStatus(status: ClankerStatus): { label: string; color: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'bg-green-100 text-green-800' }
    case 'inactive':
      return { label: 'Inactive', color: 'bg-gray-100 text-gray-800' }
    case 'deploying':
      return { label: 'Deploying', color: 'bg-blue-100 text-blue-800' }
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 text-red-800' }
    default:
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-800' }
  }
}

export function formatDeploymentStrategy(strategy: DeploymentStrategy | null | undefined): string {
  if (!strategy) return 'Not configured'

  // Capitalize first letter and format common names
  const formatters: Record<string, string> = {
    docker: 'Docker',
    ecs: 'AWS ECS',
    kubernetes: 'Kubernetes',
    k8s: 'Kubernetes',
    lambda: 'AWS Lambda',
  }

  return formatters[strategy.name.toLowerCase()] || strategy.name
}

// Re-export types for convenience
export type { Ticket, Project, Severity, AutoFixStatus, Clanker, ClankerStatus, DeploymentStrategy }
