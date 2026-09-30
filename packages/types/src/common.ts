/**
 * Common types used across the Viberglass platform
 */

// Severity levels for bug reports
export type Severity = 'low' | 'medium' | 'high' | 'critical'

// Supported ticket/project management systems
export const TICKET_SYSTEMS = [
  'jira',
  'linear',
  'github',
  'gitlab',
  'bitbucket',
  'azure',
  'asana',
  'trello',
  'monday',
  'clickup',
  'shortcut',
  'slack',
  'custom',
] as const

export type TicketSystem = (typeof TICKET_SYSTEMS)[number]

/** Tasks made in Viberglass itself, rather than taken from a connected system. */
export const NATIVE_TICKET_ORIGIN = 'native'

/** Where a task, or a space's tasks, come from. */
export type TicketOrigin = TicketSystem | typeof NATIVE_TICKET_ORIGIN

export function isTicketOrigin(value: unknown): value is TicketOrigin {
  return value === NATIVE_TICKET_ORIGIN || TICKET_SYSTEMS.some((system) => system === value)
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
