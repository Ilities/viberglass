import type { LogEntry } from '@/service/api/job-api'
import { render, screen } from '@testing-library/react'
import { createElement } from 'react'
import { LogViewer } from './log-viewer'
import { buildLogTimeline } from './agent-log-model'

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

describe('buildLogTimeline', () => {
  test('parses agent stdout JSON payload into a structured agent message event', () => {
    const log = buildLogEntry({
      message:
        '[agent:codex:stdout] {"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"Inspecting filters now"}}',
    })

    const timeline = buildLogTimeline([log])

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      kind: 'agent_message',
      sourceLabel: 'agent:codex',
      text: 'Inspecting filters now',
    })
  })

  test('merges command started and completed events by command id', () => {
    const started = buildLogEntry({
      id: 'log-start',
      createdAt: '2026-02-21T21:23:55.000Z',
      message:
        '[agent:codex:stdout] {"type":"item.started","item":{"id":"item_9","type":"command_execution","command":"echo hi","aggregated_output":"","exit_code":null,"status":"in_progress"}}',
    })
    const completed = buildLogEntry({
      id: 'log-done',
      createdAt: '2026-02-21T21:23:56.000Z',
      message:
        '[agent:codex:stdout] {"type":"item.completed","item":{"id":"item_9","type":"command_execution","command":"echo hi","aggregated_output":"hi\\n","exit_code":0,"status":"completed"}}',
    })

    const timeline = buildLogTimeline([completed, started])

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      kind: 'command_execution',
      commandId: 'item_9',
      command: 'echo hi',
      output: 'hi\n',
      exitCode: 0,
      state: 'completed',
    })
  })

  test('keeps non-agent lines as raw events', () => {
    const rawLog = buildLogEntry({
      message: 'Sending batch job logs to platform',
      source: 'viberator',
    })

    const timeline = buildLogTimeline([rawLog])

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      kind: 'raw',
      sourceLabel: 'viberator',
      text: 'Sending batch job logs to platform',
    })
  })

  test('parses direct JSON item payload logs into command events', () => {
    const log = buildLogEntry({
      id: 'direct-json-command',
      source: 'viberator',
      message:
        '{"type":"item.completed","item":{"id":"item_22","type":"command_execution","command":"echo hey","aggregated_output":"hey\\n","exit_code":0,"status":"completed"}}',
    })

    const timeline = buildLogTimeline([log])

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      kind: 'command_execution',
      commandId: 'item_22',
      command: 'echo hey',
      output: 'hey\n',
      exitCode: 0,
      state: 'completed',
      sourceLabel: 'viberator',
    })
  })

  test('deduplicates command events by command id across envelope and direct json logs', () => {
    const envelope = buildLogEntry({
      id: 'envelope-command',
      createdAt: '2026-02-21T21:23:55.000Z',
      message:
        '[agent:codex:stdout] {"type":"item.started","item":{"id":"item_31","type":"command_execution","command":"ls -la","aggregated_output":"","exit_code":null,"status":"in_progress"}}',
    })
    const direct = buildLogEntry({
      id: 'direct-command',
      createdAt: '2026-02-21T21:23:56.000Z',
      source: 'viberator',
      message:
        '{"type":"item.completed","item":{"id":"item_31","type":"command_execution","command":"ls -la","aggregated_output":"total 4\\n","exit_code":0,"status":"completed"}}',
    })

    const timeline = buildLogTimeline([direct, envelope])

    expect(timeline).toHaveLength(1)
    expect(timeline[0]).toMatchObject({
      kind: 'command_execution',
      commandId: 'item_31',
      command: 'ls -la',
      output: 'total 4\n',
      exitCode: 0,
      state: 'completed',
    })
  })
})

describe('LogViewer', () => {
  test('does not show raw log details toggle when expanded text matches visible preview', () => {
    const logs: LogEntry[] = [
      buildLogEntry({
        id: 'raw-short',
        source: 'viberator',
        message: 'Build started successfully',
      }),
    ]

    render(createElement(LogViewer, { logs }))

    expect(screen.queryByRole('button', { name: /show log details/i })).not.toBeInTheDocument()
  })

  test('shows raw log details toggle when additional text would be revealed', () => {
    const logs: LogEntry[] = [
      buildLogEntry({
        id: 'raw-long',
        source: 'viberator',
        message: `Line one\n${'x'.repeat(320)}`,
      }),
    ]

    render(createElement(LogViewer, { logs }))

    expect(screen.getByRole('button', { name: /show log details/i })).toBeInTheDocument()
  })
})
