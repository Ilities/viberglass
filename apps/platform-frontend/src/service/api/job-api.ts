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

export interface ProgressUpdate {
  step: string | null
  message: string
  details: Record<string, unknown> | null
  createdAt: string
}

export interface LogEntry {
  id: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  source: string | null
  createdAt: string
}

export interface JobStatus {
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  progress: Record<string, unknown> | null
  lastHeartbeat: string | null
  progressUpdates: ProgressUpdate[]
  logs: LogEntry[]
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

export interface JobListItem {
  jobId: string
  status: 'queued' | 'active' | 'completed' | 'failed'
  repository: string
  task: string
  tenantId: string
  createdAt: string
  processedAt: string | null
  finishedAt: string | null
}

export interface JobListResponse {
  jobs: JobListItem[]
  count: number
}

export interface JobQueueStats {
  queue: string
  waiting: number
  active: number
  completed: number
  failed: number
  total: number
}

/**
 * List jobs with optional status filter and limit
 */
export async function getJobs(params?: { status?: string; limit?: number }): Promise<JobListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.limit) searchParams.set('limit', params.limit.toString())

  const query = searchParams.toString()
  const url = query ? `${API_BASE_URL}/api/jobs?${query}` : `${API_BASE_URL}/api/jobs`
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Failed to fetch jobs')
  }

  return response.json()
}

/**
 * Get job queue statistics
 */
export async function getJobQueueStats(): Promise<JobQueueStats> {
  const response = await fetch(`${API_BASE_URL}/api/jobs/stats/queue`)

  if (!response.ok) {
    throw new Error('Failed to fetch job queue stats')
  }

  return response.json()
}
