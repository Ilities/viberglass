import type { Severity, AutoFixStatus, ClankerStatus, DeploymentStrategy } from '@viberator/types'

// Ticket formatting utilities

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

// Clanker formatting utilities

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
