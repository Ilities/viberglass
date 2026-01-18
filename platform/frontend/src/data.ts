import type { BugReport, Project, Severity, AutoFixStatus } from '@viberator/types'
import { getBugReports } from '@/service/api/bug-report-api'
import { getProjects as apiGetProjects, getProjectBySlug as apiGetProjectBySlug } from '@/service/api/project-api'

// Extended bug report with computed status for UI
export interface BugReportSummary {
  id: string
  title: string
  severity: Severity
  category: string
  timestamp: string
  ticketId?: string
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

// Bug report functions
export async function getRecentBugReports(projectSlug?: string): Promise<BugReportSummary[]> {
  try {
    const bugReports = await getBugReports({ projectSlug, limit: 10 })
    return bugReports.map((report) => ({
      id: report.id,
      title: report.title,
      severity: report.severity,
      category: report.category,
      timestamp: report.timestamp,
      ticketId: report.ticketId,
      ticketSystem: report.ticketSystem,
      autoFixStatus: report.autoFixStatus,
      status: report.ticketId ? 'resolved' : report.autoFixStatus === 'in_progress' ? 'in_progress' : 'open',
    }))
  } catch (error) {
    console.warn('Using mock data for bug reports:', error)
    return getMockBugReports()
  }
}

export async function getBugReportDetails(id: string): Promise<BugReport | null> {
  try {
    const { getBugReport } = await import('@/service/api/bug-report-api')
    return await getBugReport(id)
  } catch (error) {
    console.warn('Failed to fetch bug report details:', error)
    return null
  }
}

export async function getBugReportStats() {
  // In a real implementation, you'd have an API endpoint for stats
  // For now, return mock stats
  return getMockBugReportStats()
}

// Utility functions for bug report formatting
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
    const { triggerAutoFix: apiTriggerAutoFix } = await import('@/service/api/bug-report-api')
    await apiTriggerAutoFix(ticketId, ticketSystem, repositoryUrl)
  } catch (error) {
    console.warn('Failed to trigger auto-fix:', error)
  }
}

// Mock data for development
function getMockBugReports(): BugReportSummary[] {
  return [
    {
      id: 'bug-001',
      title: 'Button not clickable on mobile',
      severity: 'high',
      category: 'UI/UX',
      timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      ticketId: 'ISSUE-123',
      ticketSystem: 'github',
      autoFixStatus: 'pending',
      status: 'open',
    },
    {
      id: 'bug-002',
      title: 'Form validation error',
      severity: 'medium',
      category: 'Forms',
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      ticketId: 'ISSUE-124',
      ticketSystem: 'linear',
      autoFixStatus: 'completed',
      status: 'resolved',
    },
    {
      id: 'bug-003',
      title: 'Page load performance issue',
      severity: 'low',
      category: 'Performance',
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
      ticketSystem: 'jira',
      status: 'in_progress',
    },
  ]
}

function getMockBugReportStats() {
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

// Re-export types for convenience
export type { BugReport, Project, Severity, AutoFixStatus }
