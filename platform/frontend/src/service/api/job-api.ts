import { API_BASE_URL } from '@/lib'

export interface RunTicketRequest {
  clankerId: string
}

export interface RunTicketResponse {
  success: boolean
  data: {
    jobId: string
    status: string
  }
}

export interface JobStatus {
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  progress: Record<string, unknown> | null
  data: {
    id: string
    tenantId: string
    repository: string
    task: string
    branch: string | null
    baseBranch: string | null
    context: Record<string, unknown> | null
    settings: Record<string, unknown> | null
    timestamp: number
  }
  result: {
    success: boolean
    branch?: string
    pullRequestUrl?: string
    changedFiles?: string[]
    executionTime?: number
    errorMessage?: string
    commitHash?: string
  } | null
  failedReason: string | null
  createdAt: string
  processedAt: string | null
  finishedAt: string | null
}

/**
 * Run a ticket as a job with the specified clanker
 */
export async function runTicket(ticketId: string, clankerId: string): Promise<RunTicketResponse> {
  const response = await fetch(`${API_BASE_URL}/api/tickets/${ticketId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clankerId }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || error.message || 'Failed to run ticket')
  }

  return response.json()
}

/**
 * Get job status and details
 */
export async function getJob(jobId: string): Promise<JobStatus> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/${jobId}`)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Job not found')
    }
    throw new Error('Failed to fetch job')
  }

  return response.json()
}
