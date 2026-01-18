/**
 * Bug report-related types
 */

import { AutoFixStatus, Severity, TicketSystem } from './common'

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

// Complete metadata object captured with bug report
export interface BugReportMetadata {
  browser: BrowserInfo
  os: OSInfo
  screen: ScreenInfo
  network: NetworkInfo
  console: LogEntry[]
  errors: ErrorInfo[]
  pageUrl: string
  referrer?: string
  localStorage?: Record<string, unknown>
  sessionStorage?: Record<string, unknown>
  timestamp: string
  timezone: string
}

// Bug report entity
export interface BugReport {
  id: string
  projectId: string
  timestamp: string
  title: string
  description: string
  severity: Severity
  category: string
  metadata: BugReportMetadata
  screenshot: MediaAsset
  recording?: MediaAsset
  annotations: Annotation[]
  ticketId?: string
  ticketUrl?: string
  ticketSystem: TicketSystem
  autoFixRequested: boolean
  autoFixStatus?: AutoFixStatus
  pullRequestUrl?: string
  createdAt: string
  updatedAt: string
}

// Request body for creating a bug report (without files - those come via multipart)
export interface CreateBugReportRequest {
  projectId: string
  title: string
  description: string
  severity: Severity
  category: string
  metadata: BugReportMetadata
  annotations: Annotation[]
  autoFixRequested: boolean
  ticketSystem: TicketSystem
}

// Request body for updating a bug report
export interface UpdateBugReportRequest {
  title?: string
  description?: string
  severity?: Severity
  category?: string
  ticketId?: string
  ticketUrl?: string
  autoFixStatus?: AutoFixStatus
  pullRequestUrl?: string
}

// Bug report list item (lighter version for lists)
export interface BugReportListItem {
  id: string
  projectId: string
  timestamp: string
  title: string
  severity: Severity
  category: string
  ticketId?: string
  ticketUrl?: string
  autoFixRequested: boolean
  autoFixStatus?: AutoFixStatus
  createdAt: string
  updatedAt: string
}

// Query parameters for listing bug reports
export interface BugReportListParams {
  projectId?: string
  projectSlug?: string
  limit?: number
  offset?: number
}
