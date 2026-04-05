/**
 * Ticket-related types (formerly bug-report)
 */

import { AutoFixStatus, Severity, TicketSystem } from './common'

export const TICKET_STATUS = {
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  IN_REVIEW: 'in_review',
  RESOLVED: 'resolved',
} as const

export type TicketLifecycleStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS]

export const TICKET_WORKFLOW_PHASE = {
  RESEARCH: 'research',
  PLANNING: 'planning',
  EXECUTION: 'execution',
} as const

export type TicketWorkflowPhase =
  (typeof TICKET_WORKFLOW_PHASE)[keyof typeof TICKET_WORKFLOW_PHASE]

export const TICKET_ARCHIVE_FILTER = {
  EXCLUDE: 'exclude',
  ONLY: 'only',
  INCLUDE: 'include',
} as const

export type TicketArchiveFilter = (typeof TICKET_ARCHIVE_FILTER)[keyof typeof TICKET_ARCHIVE_FILTER]

// Browser information
export interface BrowserInfo {
  name: string
  version: string
}

// Operating system information
export interface OSInfo {
  name: string
  version: string
}

// Screen resolution and viewport info
export interface ScreenInfo {
  width: number
  height: number
  viewportWidth: number
  viewportHeight: number
  pixelRatio: number
}

// Network and client information
export interface NetworkInfo {
  userAgent: string
  language: string
  cookiesEnabled: boolean
  onLine: boolean
}

// Console log entry
export interface LogEntry {
  level: 'error' | 'warn' | 'info' | 'debug'
  message: string
  timestamp: string
  source?: string
}

// JavaScript error information
export interface ErrorInfo {
  message: string
  stack?: string
  filename?: string
  lineno?: number
  colno?: number
  timestamp: string
}

// Media asset (screenshot/recording)
export interface MediaAsset {
  id: string
  filename: string
  mimeType: string
  size: number
  url: string
  storageUrl?: string
  uploadedAt: string
}

// Screenshot annotation types
export type AnnotationType = 'arrow' | 'rectangle' | 'text' | 'blur'

// Screenshot annotation
export interface Annotation {
  id: string
  type: AnnotationType
  x: number
  y: number
  width?: number
  height?: number
  text?: string
  color?: string
}

// Complete metadata object captured with ticket
export interface TicketMetadata {
  browser?: BrowserInfo
  os?: OSInfo
  screen?: ScreenInfo
  network?: NetworkInfo
  console?: LogEntry[]
  errors?: ErrorInfo[]
  pageUrl?: string
  referrer?: string
  localStorage?: Record<string, unknown>
  sessionStorage?: Record<string, unknown>
  timestamp: string
  timezone: string
}

export interface Ticket {
  id: string
  projectId: string
  timestamp: string
  title: string
  description: string
  severity: Severity
  category: string
  status: TicketLifecycleStatus
  workflowPhase: TicketWorkflowPhase
  archivedAt?: string
  metadata: TicketMetadata
  screenshot?: MediaAsset
  recording?: MediaAsset
  annotations: Annotation[]
  externalTicketId?: string
  externalTicketUrl?: string
  ticketSystem: TicketSystem
  autoFixRequested: boolean
  autoFixStatus?: AutoFixStatus
  pullRequestUrl?: string
  workflowOverrideReason?: string
  workflowOverriddenAt?: string
  workflowOverriddenBy?: string
  createdAt: string
  updatedAt: string
}

// Request body for creating a ticket (without files - those come via multipart)
export interface CreateTicketRequest {
  projectId: string
  title: string
  description: string
  severity: Severity
  category: string
  metadata: TicketMetadata
  annotations: Annotation[]
  autoFixRequested: boolean
  ticketSystem: TicketSystem
  workflowPhase?: TicketWorkflowPhase
}

// Request body for updating a ticket
export interface UpdateTicketRequest {
  title?: string
  description?: string
  severity?: Severity
  category?: string
  status?: TicketLifecycleStatus
  externalTicketId?: string
  externalTicketUrl?: string
  autoFixStatus?: AutoFixStatus
  pullRequestUrl?: string
}

// Ticket list item (lighter version for lists)
export interface TicketListItem {
  id: string
  projectId: string
  timestamp: string
  title: string
  severity: Severity
  category: string
  status: TicketLifecycleStatus
  workflowPhase: TicketWorkflowPhase
  archivedAt?: string
  externalTicketId?: string
  externalTicketUrl?: string
  autoFixRequested: boolean
  autoFixStatus?: AutoFixStatus
  workflowOverrideReason?: string
  workflowOverriddenAt?: string
  workflowOverriddenBy?: string
  createdAt: string
  updatedAt: string
}

// Query parameters for listing tickets
export interface TicketListParams {
  projectId?: string
  projectSlug?: string
  limit?: number
  offset?: number
  statuses?: TicketLifecycleStatus[]
  workflowPhases?: TicketWorkflowPhase[]
  archived?: TicketArchiveFilter
  severity?: Severity
  search?: string
}

export interface TicketStats {
  total: number
  open: number
  resolved: number
  inProgress: number
  bySeverity: {
    critical: number
    high: number
    medium: number
    low: number
  }
  byCategory: Record<string, number>
  autoFixStats: {
    requested: number
    completed: number
    pending: number
    failed: number
  }
}
