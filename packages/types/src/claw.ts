/**
 * Claw-related types
 * Claw is the scheduled task execution system for running clanker tasks on a schedule
 */

// Status of a claw execution
export type ClawExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'

// Type of schedule
export type ClawScheduleType = 'interval' | 'cron'

// Active status of a schedule
export type ClawScheduleActiveStatus = 'active' | 'paused'

// Task template entity - reusable definition of a task
export interface ClawTaskTemplate {
  id: string
  projectId: string
  name: string
  description: string | null
  clankerId: string
  taskInstructions: string
  config: Record<string, unknown>
  secretIds: string[]
  createdAt: string
  updatedAt: string
}

// Request body for creating a task template
export interface CreateClawTaskTemplateRequest {
  projectId: string
  name: string
  description?: string | null
  clankerId: string
  taskInstructions: string
  config?: Record<string, unknown>
  secretIds?: string[]
}

// Request body for updating a task template
export interface UpdateClawTaskTemplateRequest {
  name?: string
  description?: string | null
  clankerId?: string
  taskInstructions?: string
  config?: Record<string, unknown>
  secretIds?: string[]
}

// Task template summary for list views
export interface ClawTaskTemplateSummary {
  id: string
  projectId: string
  name: string
  description: string | null
  clankerId: string
  secretIds: string[]
  createdAt: string
  updatedAt: string
}

// Schedule entity - defines when to run a task template
export interface ClawSchedule {
  id: string
  projectId: string
  taskTemplateId: string
  name: string
  description: string | null
  scheduleType: ClawScheduleType
  intervalExpression: string | null
  cronExpression: string | null
  timezone: string
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  runCount: number
  failureCount: number
  webhookConfig: ClawWebhookConfig | null
  createdAt: string
  updatedAt: string
  createdBy: string | null
}

// Webhook configuration for claw events
export interface ClawWebhookConfig {
  url: string
  secret?: string | null
  events: ClawEventType[]
}

// Events that can trigger webhooks
export type ClawEventType = 'started' | 'completed' | 'failed'

// Request body for creating a schedule
export interface CreateClawScheduleRequest {
  projectId: string
  taskTemplateId: string
  name: string
  description?: string | null
  scheduleType: ClawScheduleType
  intervalExpression?: string | null
  cronExpression?: string | null
  timezone?: string
  isActive?: boolean
  webhookConfig?: ClawWebhookConfig | null
}

// Request body for updating a schedule
export interface UpdateClawScheduleRequest {
  name?: string
  description?: string | null
  scheduleType?: ClawScheduleType
  intervalExpression?: string | null
  cronExpression?: string | null
  timezone?: string
  isActive?: boolean
  webhookConfig?: ClawWebhookConfig | null
}

// Schedule summary for list views
export interface ClawScheduleSummary {
  id: string
  projectId: string
  taskTemplateId: string
  name: string
  description: string | null
  scheduleType: ClawScheduleType
  intervalExpression: string | null
  cronExpression: string | null
  timezone: string
  isActive: boolean
  lastRunAt: string | null
  nextRunAt: string | null
  runCount: number
  failureCount: number
  createdAt: string
  updatedAt: string
}

// Query parameters for listing schedules
export interface ClawScheduleListParams {
  projectId?: string
  limit?: number
  offset?: number
  isActive?: boolean
  scheduleType?: ClawScheduleType
}

// Execution entity - history of a scheduled task run
export interface ClawExecution {
  id: string
  scheduleId: string
  jobId: string | null
  status: ClawExecutionStatus
  startedAt: string | null
  completedAt: string | null
  errorMessage: string | null
  result: Record<string, unknown> | null
  webhookDeliveryStatus: ClawWebhookDeliveryStatus | null
  createdAt: string
}

// Webhook delivery status
export interface ClawWebhookDeliveryStatus {
  started?: {
    success: boolean
    statusCode?: number
    errorMessage?: string
    sentAt?: string
  }
  completed?: {
    success: boolean
    statusCode?: number
    errorMessage?: string
    sentAt?: string
  }
  failed?: {
    success: boolean
    statusCode?: number
    errorMessage?: string
    sentAt?: string
  }
}

// Query parameters for listing executions
export interface ClawExecutionListParams {
  scheduleId?: string
  limit?: number
  offset?: number
  status?: ClawExecutionStatus
}

// Execution summary for list views
export interface ClawExecutionSummary {
  id: string
  scheduleId: string
  jobId: string | null
  status: ClawExecutionStatus
  startedAt: string | null
  completedAt: string | null
  createdAt: string
}

// Stats for claw system
export interface ClawStats {
  totalTemplates: number
  totalSchedules: number
  activeSchedules: number
  totalExecutions: number
  executionsByStatus: Record<ClawExecutionStatus, number>
  recentExecutions: ClawExecutionSummary[]
}

// Webhook event payload
export interface ClawWebhookEvent {
  eventType: ClawEventType
  executionId: string
  scheduleId: string
  scheduleName: string
  projectId: string
  status: ClawExecutionStatus
  result?: Record<string, unknown> | null
  errorMessage?: string | null
  startedAt: string | null
  completedAt: string | null
  timestamp: string
}

// Interval expression parsing result
export interface ClawIntervalExpression {
  value: number
  unit: 'minutes' | 'hours' | 'days' | 'weeks'
}

// Valid interval expression patterns
export const CLAW_INTERVAL_PATTERNS = {
  MINUTES: /^(\d+)m$/,
  HOURS: /^(\d+)h$/,
  DAYS: /^(\d+)d$/,
  WEEKS: /^(\d+)w$/,
} as const

/**
 * Parse an interval expression like "5m", "1h", "1d", "1w"
 * @returns Parsed interval or null if invalid
 */
export function parseIntervalExpression(expression: string): ClawIntervalExpression | null {
  // Minutes
  const minutesMatch = expression.match(CLAW_INTERVAL_PATTERNS.MINUTES)
  if (minutesMatch) {
    return { value: parseInt(minutesMatch[1], 10), unit: 'minutes' }
  }

  // Hours
  const hoursMatch = expression.match(CLAW_INTERVAL_PATTERNS.HOURS)
  if (hoursMatch) {
    return { value: parseInt(hoursMatch[1], 10), unit: 'hours' }
  }

  // Days
  const daysMatch = expression.match(CLAW_INTERVAL_PATTERNS.DAYS)
  if (daysMatch) {
    return { value: parseInt(daysMatch[1], 10), unit: 'days' }
  }

  // Weeks
  const weeksMatch = expression.match(CLAW_INTERVAL_PATTERNS.WEEKS)
  if (weeksMatch) {
    return { value: parseInt(weeksMatch[1], 10), unit: 'weeks' }
  }

  return null
}

/**
 * Convert an interval expression to a cron expression
 * For example: "5m" becomes "0 asterisk-slash-5 asterisk asterisk asterisk asterisk" (cron format)
 */
export function intervalToCron(expression: string): string | null {
  const parsed = parseIntervalExpression(expression)
  if (!parsed) {
    return null
  }

  switch (parsed.unit) {
    case 'minutes':
      // "5m" -> "0 */5 * * * *" (every 5 minutes)
      return `0 */${parsed.value} * * * *`
    case 'hours':
      // "1h" -> "0 0 */1 * * *" (every hour)
      return `0 0 */${parsed.value} * * *`
    case 'days':
      // "1d" -> "0 0 1 * * *" (daily at 1am)
      return `0 0 ${parsed.value === 1 ? 1 : `*/${parsed.value}`} * * *`
    case 'weeks':
      // "1w" -> "0 0 1 * * 0" (weekly on Sunday at 1am)
      return `0 0 1 * * ${parsed.value === 1 ? 0 : `*/${parsed.value}`}`
    default:
      return null
  }
}

/**
 * Validate a cron expression
 * Minimum resolution is 1 minute — the seconds field must be a fixed value (0-59).
 */
export function isValidCronExpression(expression: string): boolean {
  // Cron format: sec min hour day month dow (6 fields)
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 6) return false

  // Seconds field must be a plain integer (0-59) — no * or */N allowed
  const secondsField = parts[0]
  if (!/^\d+$/.test(secondsField) || parseInt(secondsField, 10) > 59) return false

  const restPattern = /^(\*|([0-9]|[1-5][0-9])|\*\/[0-9]+) (\*|([0-9]|1[0-9]|2[0-3])|\*\/[0-9]+) (\*|([1-9]|[12][0-9]|3[01])|\*\/[0-9]+) (\*|([1-9]|1[0-2])|\*\/[0-9]+) (\*|([0-6])|\*\/[0-9]+)$/
  return restPattern.test(parts.slice(1).join(' '))
}
