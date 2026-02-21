import type { LogEntry } from '@/service/api/job-api'
import { parseLogEntryForDisplay } from './log-viewer'

function buildLogEntry(overrides: Partial<LogEntry>): LogEntry {
  return {
    id: 'log-1',
    level: 'info',
    message: 'default message',
    source: 'viberator',
    createdAt: '2026-02-21T21:23:55.000Z',
    ...overrides,
  }
}

describe('parseLogEntryForDisplay', () => {
  test('parses agent stdout JSON payload into structured row data', () => {
    const log = buildLogEntry({
      message:
        '[agent:codex:stdout] {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Inspecting filters now"}}',
    })

    const parsed = parseLogEntryForDisplay(log)

    expect(parsed.originLabel).toBe('agent:codex')
    expect(parsed.streamLabel).toBe('STDOUT')
    expect(parsed.eventLabel).toBe('item.completed · agent_message')
    expect(parsed.detail).toBe('Inspecting filters now')
  })

  test('shows thread id when payload has no message text', () => {
    const log = buildLogEntry({
      message: '[agent:codex:stdout] {"type":"thread.started","thread_id":"thread-123"}',
    })

    const parsed = parseLogEntryForDisplay(log)

    expect(parsed.eventLabel).toBe('thread.started')
    expect(parsed.detail).toBe('thread_id: thread-123')
  })

  test('keeps viberator lines distinct from agent lines', () => {
    const log = buildLogEntry({
      message: 'Sending batch job logs to platform',
      source: 'viberator',
    })

    const parsed = parseLogEntryForDisplay(log)

    expect(parsed.originLabel).toBe('viberator')
    expect(parsed.streamLabel).toBeNull()
    expect(parsed.eventLabel).toBeNull()
    expect(parsed.detail).toBe('Sending batch job logs to platform')
  })
})
