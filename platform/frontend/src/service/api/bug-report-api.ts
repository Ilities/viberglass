import { API_BASE_URL } from '@/lib'
import type {
  ApiResponse,
  BugReport,
  BugReportListParams,
  PaginatedResponse,
  UpdateBugReportRequest,
  WebhookStatus,
} from '@viberator/types'

// Bug Reports API
export async function getBugReports(params: BugReportListParams = {}): Promise<BugReport[]> {
  const { projectId, projectSlug, limit = 50, offset = 0 } = params
  const query = projectSlug ? `projectSlug=${projectSlug}` : projectId ? `projectId=${projectId}` : ''
  const response = await fetch(`${API_BASE_URL}/api/bug-reports?${query}&limit=${limit}&offset=${offset}`)
  if (!response.ok) {
    throw new Error('Failed to fetch bug reports')
  }
  const data: PaginatedResponse<BugReport> = await response.json()
  return data.data
}

export async function getBugReport(id: string): Promise<BugReport> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports/${id}`)
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Bug report not found')
    }
    throw new Error('Failed to fetch bug report')
  }
  const data: ApiResponse<BugReport> = await response.json()
  return data.data
}

export async function updateBugReport(id: string, updates: UpdateBugReportRequest): Promise<BugReport> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports/${id}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to update bug report')
  }
  const data: ApiResponse<BugReport> = await response.json()
  return data.data
}

export async function getMediaSignedUrl(
  bugReportId: string,
  mediaId: string
): Promise<{ signedUrl: string; expiresIn: number }> {
  const response = await fetch(`${API_BASE_URL}/api/bug-reports/${bugReportId}/media/${mediaId}/signed-url`)
  if (!response.ok) {
    throw new Error('Failed to get signed URL')
  }
  const data: ApiResponse<{ signedUrl: string; expiresIn: number }> = await response.json()
  return data.data
}

// Webhook Status API
export async function getWebhookStatus(): Promise<WebhookStatus> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/status`)
  if (!response.ok) {
    throw new Error('Failed to fetch webhook status')
  }
  const data: ApiResponse<WebhookStatus> = await response.json()
  return data.data
}

// Auto-fix API
export async function triggerAutoFix(ticketId: string, ticketSystem: string, repositoryUrl?: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/webhooks/trigger-autofix`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      ticketId,
      ticketSystem,
      repositoryUrl,
    }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.message || 'Failed to trigger auto-fix')
  }
}

// Re-export types for convenience
export type { BugReport, UpdateBugReportRequest, BugReportListParams, Severity, AutoFixStatus } from '@viberator/types'
