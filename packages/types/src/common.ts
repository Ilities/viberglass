/**
 * Common types used across the Viberglass platform
 */

// Severity levels for bug reports
export type Severity = 'low' | 'medium' | 'high' | 'critical'

// Supported ticket/project management systems
export type TicketSystem =
  | 'jira'
  | 'linear'
  | 'github'
  | 'gitlab'
  | 'azure'
  | 'asana'
  | 'trello'
  | 'monday'
  | 'clickup'

// Auto-fix processing status
export type AutoFixStatus = 'pending' | 'in_progress' | 'completed' | 'failed'

// API response wrapper
export interface ApiResponse<T> {
  success: boolean
  data: T
}

// Paginated response wrapper
export interface PaginatedResponse<T> {
  success: boolean
  data: T[]
  pagination: {
    limit: number
    offset: number
    count: number
    total?: number
  }
}

// Error response format
export interface ApiError {
  error: string
  message?: string
  details?: Array<{
    field: string
    message: string
  }>
}
