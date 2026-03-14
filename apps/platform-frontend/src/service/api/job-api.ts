import { API_BASE_URL } from '@/lib'
import { apiFetch } from '@/service/api/client'

export interface JobOverrides {
  additionalContext?: string
  reproductionSteps?: string
  expectedBehavior?: string
  priorityOverride?: 'critical' | 'high' | 'medium' | 'low'
  settings?: {
    maxChanges?: number
    testRequired?: boolean
    codingStandards?: string
    runTests?: boolean
    testCommand?: string
    maxExecutionTime?: number
  }
}

export interface RunTicketRequest {
  clankerId: string
  overrides?: JobOverrides
  instructionFiles?: Array<{
    fileType: string
    content: string
  }>
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

export interface JobDataContext {
  ticketId?: string
  clawExecutionId?: string
  clawScheduleId?: string
  clawTemplateName?: string
  stepsToReproduce?: string
  expectedBehavior?: string
  additionalContext?: string
  actualBehavior?: string
  stackTrace?: string
  consoleErrors?: string[]
  affectedFiles?: string[]
  instructionFiles?: Array<{
    fileType: string
    content?: string
    mountPath?: string
  }>
  ticketMedia?: Array<{
    id: string
    kind: 'screenshot' | 'recording'
    filename: string
    mimeType: string
    size: number
    uploadedAt: string
    storageUrl: string
    mountPath?: string
    s3Url?: string
    accessUrl?: string
  }>
}

export interface JobDataSettings {
  maxChanges?: number
  testRequired?: boolean
  codingStandards?: string
  runTests?: boolean
  testCommand?: string
  maxExecutionTime?: number
}

export interface JobStatusTicket {
  id: string
  title: string
  externalTicketId: string | null
}

export interface JobStatusClanker {
  id: string
  name: string
  slug: string
  description: string | null
  agent: string | null
}

export interface JobStatus {
  jobId: string
  jobKind: 'research' | 'planning' | 'execution' | 'claw'
  status: 'queued' | 'active' | 'completed' | 'failed'
  progress: Record<string, unknown> | null
  lastHeartbeat: string | null
  progressUpdates: ProgressUpdate[]
  logs: LogEntry[]
  data: {
    id: string
    jobKind: 'research' | 'execution' | 'claw'
    tenantId: string
    repository: string
    task: string
    branch: string | null
    baseBranch: string | null
    context: JobDataContext | null
    settings: JobDataSettings | null
    timestamp: number
  }
  result: {
    success: boolean
    branch?: string
    pullRequestUrl?: string
    documentContent?: string
    changedFiles?: string[]
    executionTime?: number
    errorMessage?: string
    commitHash?: string
  } | null
  failedReason: string | null
  createdAt: string
  processedAt: string | null
  finishedAt: string | null
  ticketId: string | null
  ticket: JobStatusTicket | null
  clankerId: string | null
  clanker: JobStatusClanker | null
}

/**
 * Run a ticket as a job with the specified clanker
 */
export async function runTicket(
  ticketId: string,
  clankerId: string,
  overrides?: JobOverrides,
  instructionFiles?: Array<{ fileType: string; content: string }>,
): Promise<RunTicketResponse> {
  const response = await apiFetch(`${API_BASE_URL}/api/tickets/${ticketId}/run`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ clankerId, overrides, instructionFiles }),
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
  const response = await apiFetch(`${API_BASE_URL}/api/jobs/${jobId}`)

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Job not found')
    }
    throw new Error('Failed to fetch job')
  }

  return response.json()
}

export interface JobListItemTicket {
  id: string
  title: string
  externalTicketId: string | null
}

export interface JobListItem {
  jobId: string
  jobKind: 'research' | 'planning' | 'execution' | 'claw'
  status: 'queued' | 'active' | 'completed' | 'failed'
  repository: string
  task: string
  tenantId: string
  createdAt: string
  processedAt: string | null
  finishedAt: string | null
  ticketId: string | null
  ticket: JobListItemTicket | null
  projectSlug?: string
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
 * List jobs with optional status filter, limit, projectSlug, and ticketId
 */
export async function getJobs(params?: { status?: string; limit?: number; projectSlug?: string; ticketId?: string }): Promise<JobListResponse> {
  const searchParams = new URLSearchParams()
  if (params?.status) searchParams.set('status', params.status)
  if (params?.limit) searchParams.set('limit', params.limit.toString())
  if (params?.projectSlug) searchParams.set('projectSlug', params.projectSlug)
  if (params?.ticketId) searchParams.set('ticketId', params.ticketId)

  const query = searchParams.toString()
  const url = query ? `${API_BASE_URL}/api/jobs?${query}` : `${API_BASE_URL}/api/jobs`
  const response = await apiFetch(url)

  if (!response.ok) {
    throw new Error('Failed to fetch jobs')
  }

  return response.json()
}

/**
 * Get job queue statistics
 */
export async function getJobQueueStats(): Promise<JobQueueStats> {
  const response = await apiFetch(`${API_BASE_URL}/api/jobs/stats/queue`)

  if (!response.ok) {
    throw new Error('Failed to fetch job queue stats')
  }

  return response.json()
}
