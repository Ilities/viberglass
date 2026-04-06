import type { ClankerStatus, DeploymentStrategy } from '@viberglass/types'

// Ticket formatting utilities

export function formatSeverity(severity: string): { label: string; color: string; barColor: string; badgeColor: 'red' | 'orange' | 'yellow' | 'green' | 'zinc' } {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: 'bg-red-100 text-red-800', barColor: 'bg-red-500', badgeColor: 'red' }
    case 'high':
      return { label: 'High', color: 'bg-orange-100 text-orange-800', barColor: 'bg-orange-500', badgeColor: 'orange' }
    case 'medium':
      return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800', barColor: 'bg-yellow-500', badgeColor: 'yellow' }
    case 'low':
      return { label: 'Low', color: 'bg-green-100 text-green-800', barColor: 'bg-green-500', badgeColor: 'green' }
    default:
      return { label: 'Unknown', color: 'bg-gray-100 text-gray-800', barColor: 'bg-gray-500', badgeColor: 'zinc' }
  }
}

export function formatAutoFixStatus(status?: string): { label: string; color: string } {
  switch (status) {
    case 'completed':
      return { label: 'Fixed', color: 'bg-green-100 text-green-800' }
    case 'in_progress':
      return { label: 'Fixing', color: 'bg-amber-100 text-amber-800' }
    case 'pending':
      return { label: 'Pending', color: 'bg-amber-100 text-amber-800' }
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 text-red-800' }
    default:
      return { label: 'Not Requested', color: 'bg-gray-100 text-gray-800' }
  }
}

export function formatTicketSystem(system: string): string {
  const systems: Record<string, string> = {
    github: 'GitHub',
    gitlab: 'GitLab',
    bitbucket: 'Bitbucket',
    jira: 'Jira',
    linear: 'Linear',
    monday: 'Monday',
    shortcut: 'Shortcut',
    slack: 'Slack',
    custom: 'Custom Webhook',
  }
  return systems[system] || system
}

export function formatTimestamp(date: string | Date): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date
  const now = new Date()
  const diffInMs = now.getTime() - dateObj.getTime()
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
  const diffInHours = diffInMs / (1000 * 60 * 60)
  const diffInDays = diffInMs / (1000 * 60 * 60 * 24)

  if (diffInMinutes < 1) {
    return 'Just now'
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`
  } else if (diffInHours < 24) {
    return `${Math.floor(diffInHours)}h ago`
  } else if (diffInDays < 7) {
    return `${Math.floor(diffInDays)}d ago`
  } else {
    return dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
}

// Clanker formatting utilities

export function formatClankerStatus(status: ClankerStatus): { label: string; color: string; tooltip?: string } {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'bg-green-100 text-green-800', tooltip: 'Running and ready to accept tasks' }
    case 'inactive':
      return { label: 'Inactive', color: 'bg-gray-100 text-gray-800', tooltip: 'Not started — needs to be provisioned' }
    case 'deploying':
      return { label: 'Deploying', color: 'bg-blue-100 text-blue-800', tooltip: 'Provisioning in progress' }
    case 'failed':
      return { label: 'Failed', color: 'bg-red-100 text-red-800', tooltip: 'Deployment failed — check configuration' }
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
    'aws-lambda-container': 'AWS Lambda',
  }

  return formatters[strategy.name.toLowerCase()] || strategy.name
}

// Job formatting utilities

export function formatJobKind(kind: string): string {
  switch (kind) {
    case 'research':
      return 'Research'
    case 'execution':
      return 'Execution'
    case 'planning':
      return 'Planning'
    case 'claw':
      return 'Scheduled'
    default:
      return kind
  }
}

export function formatJobStatus(status: string): { label: string; color: 'green' | 'blue' | 'amber' | 'red' | 'zinc' } {
  switch (status) {
    case 'completed':
      return { label: 'Completed', color: 'green' }
    case 'active':
      return { label: 'Running', color: 'blue' }
    case 'queued':
      return { label: 'Queued', color: 'amber' }
    case 'failed':
      return { label: 'Failed', color: 'red' }
    default:
      return { label: 'Unknown', color: 'zinc' }
  }
}

export function jobKindBadgeColor(kind: string): 'blue' | 'teal' | 'amber' | 'violet' {
  if (kind === 'research') return 'blue'
  if (kind === 'planning') return 'teal'
  if (kind === 'claw') return 'amber'
  return 'violet'
}
