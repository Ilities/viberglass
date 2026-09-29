import type { AgentSessionEventType } from '@/service/api/session-api'
import { liveSessionStatus } from './liveSessionStatus'

function events(...types: AgentSessionEventType[]) {
  return types.map((eventType) => ({ eventType }))
}

describe('liveSessionStatus', () => {
  it('waits on the person once a turn completes without ending the session', () => {
    expect(liveSessionStatus(events('turn_started', 'assistant_message', 'turn_completed'))).toBe('waiting_on_user')
  })

  it('is active again once the person replies or the next turn starts', () => {
    expect(liveSessionStatus(events('turn_completed', 'user_message'))).toBe('active')
    expect(liveSessionStatus(events('turn_completed', 'user_message', 'turn_started'))).toBe('active')
  })

  it('reads through presence and streaming events to the last one that says something', () => {
    expect(liveSessionStatus(events('turn_completed', 'session_completed', 'user_left'))).toBe('completed')
    expect(liveSessionStatus(events('turn_started', 'reasoning', 'tool_call_started'))).toBe('active')
  })

  it('reports pending requests', () => {
    expect(liveSessionStatus(events('turn_started', 'needs_input'))).toBe('waiting_on_user')
    expect(liveSessionStatus(events('turn_started', 'needs_approval'))).toBe('waiting_on_approval')
  })

  it('leaves the stored status in charge after a failed turn or before any turn', () => {
    expect(liveSessionStatus(events('turn_started', 'turn_failed'))).toBeUndefined()
    expect(liveSessionStatus(events('session_started'))).toBeUndefined()
    expect(liveSessionStatus([])).toBeUndefined()
  })
})
