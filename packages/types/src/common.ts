/**
 * Common types used across the Viberglass platform
 */

// Severity levels for bug reports
export type Severity = 'low' | 'medium' | 'high' | 'critical'

/**
 * Id of a connected system, such as an issue tracker or source host. Each one is an
 * integration plugin; the integration registry knows which a build includes.
 */
export type TicketSystem = string

/** Tasks made in Viberglass itself, rather than taken from a connected system. */
export const NATIVE_TICKET_ORIGIN = 'native'

/** Where a task, or a space's tasks, come from: a connected system's id, or native. */
export type TicketOrigin = TicketSystem

export function isTicketOrigin(value: unknown): value is TicketOrigin {
  return typeof value === 'string' && value.length > 0
}

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
