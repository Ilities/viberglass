export function getSeverityBadge(severity: string): { label: string; color: 'red' | 'orange' | 'yellow' | 'green' | 'zinc' } {
  switch (severity) {
    case 'critical': return { label: 'Critical', color: 'red' }
    case 'high': return { label: 'High', color: 'orange' }
    case 'medium': return { label: 'Medium', color: 'yellow' }
    case 'low': return { label: 'Low', color: 'green' }
    default: return { label: 'Unknown', color: 'zinc' }
  }
}

export function getAutoFixBadge(status?: string): { label: string; color: 'green' | 'amber' | 'red' | 'zinc' } {
  switch (status) {
    case 'completed': return { label: 'Fixed', color: 'green' }
    case 'in_progress': return { label: 'Fixing', color: 'amber' }
    case 'pending': return { label: 'Pending', color: 'amber' }
    case 'failed': return { label: 'Failed', color: 'red' }
    default: return { label: 'Not Requested', color: 'zinc' }
  }
}

export function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}
