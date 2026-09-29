import type { AgentSessionEvent, AgentSessionEventType, AgentSessionStatus } from '@/service/api/session-api'

const STATUS_BY_EVENT: Partial<Record<AgentSessionEventType, AgentSessionStatus>> = {
  session_completed: 'completed',
  session_failed: 'failed',
  session_cancelled: 'cancelled',
  needs_input: 'waiting_on_user',
  needs_approval: 'waiting_on_approval',
  // The agent answered without ending the session, so the person is next.
  turn_completed: 'waiting_on_user',
  turn_started: 'active',
  user_message: 'active',
}

/**
 * The session's status as the event stream tells it, ahead of a refetch.
 * Undefined means the stream doesn't say, so the stored status applies.
 */
export function liveSessionStatus(events: Pick<AgentSessionEvent, 'eventType'>[]): AgentSessionStatus | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    const eventType = events[i].eventType
    if (eventType === 'turn_failed') return undefined
    const status = STATUS_BY_EVENT[eventType]
    if (status) return status
  }
  return undefined
}
