import type { RunEvent } from '@/service/api/job-api'
import { buildRunTranscript, inRepository, toolCallCount } from './run-transcript'

let sequence = 0
function event(eventType: string, payloadJson: Record<string, unknown>): RunEvent {
  sequence += 1
  return { id: `e${sequence}`, sequence, eventType, payloadJson, createdAt: '2026-10-05T11:28:00Z' }
}

describe('buildRunTranscript', () => {
  it('joins streamed chunks of what the agent thought and said', () => {
    const steps = buildRunTranscript([
      event('reasoning', { text: 'Let me ' }),
      event('reasoning', { text: 'look.' }),
      event('assistant_message', { text: 'Exploring ' }),
      event('assistant_message', { text: 'the repo.' }),
      event('reasoning', { text: 'Done.' }),
    ])
    expect(steps.map((step) => (step.kind === 'tool' ? step.kind : [step.kind, step.text]))).toEqual([
      ['thought', 'Let me look.'],
      ['said', 'Exploring the repo.'],
      ['thought', 'Done.'],
    ])
  })

  it('shows a tool call once, with the input it got after it was announced and how it ended', () => {
    const steps = buildRunTranscript([
      event('tool_call_started', { toolCallId: 'c1', toolName: 'bash', kind: 'execute', input: {} }),
      event('assistant_message', { text: 'Checking.' }),
      event('tool_call_started', { toolCallId: 'c1', toolName: 'List files', kind: 'execute', input: { command: 'ls -la' }, locations: [] }),
      event('tool_call_completed', { toolCallId: 'c1', toolName: 'List files', output: 'README.md', success: true }),
      event('tool_call_started', { toolCallId: 'c2', toolName: 'read', input: { filePath: '/repo/x.js' }, locations: ['/repo/x.js'] }),
      event('tool_call_completed', { toolCallId: 'c2', error: 'No such file', success: false }),
    ])
    expect(steps).toEqual([
      { kind: 'tool', id: 'c1', title: 'List files', toolKind: 'execute', detail: 'ls -la', locations: [], status: 'done', output: 'README.md' },
      { kind: 'said', id: expect.any(String), text: 'Checking.' },
      { kind: 'tool', id: 'c2', title: 'read', toolKind: null, detail: '/repo/x.js', locations: ['/repo/x.js'], status: 'failed', output: 'No such file' },
    ])
    expect(toolCallCount(steps)).toBe(2)
  })

  it('names a call by what its finish says it worked on, when its start said nothing', () => {
    const [step] = buildRunTranscript([
      event('tool_call_started', { toolCallId: 'c1', toolName: 'read', input: {} }),
      event('tool_call_completed', { toolCallId: 'c1', toolName: 'src/App.jsx', output: '', success: true }),
    ])
    expect(step).toMatchObject({ title: 'read', detail: 'src/App.jsx', status: 'done' })
  })

  it('keeps a call it never saw start, and progress notes', () => {
    const steps = buildRunTranscript([
      event('progress', { text: "Started the agent's session" }),
      event('tool_call_completed', { toolCallId: 'c9', toolName: 'grep', output: '3 matches', success: true }),
      event('turn_completed', { produced: ['plan'] }),
    ])
    expect(steps).toEqual([
      { kind: 'note', id: expect.any(String), text: "Started the agent's session" },
      { kind: 'tool', id: 'c9', title: 'grep', toolKind: null, detail: null, locations: [], status: 'done', output: '3 matches' },
    ])
  })
})

describe('inRepository', () => {
  it('shows paths as they are in the repository, not in the worker', () => {
    expect(inRepository('/tmp/viberator-work/task-0f3a/repo/src/App.jsx')).toBe('src/App.jsx')
    expect(inRepository('cd /tmp/viberator-work/task-0f3a/repo && ls')).toBe('cd . && ls')
    expect(inRepository('/work/2b1c4d5e-1111-2222-3333-444455556666/repo/README.md')).toBe('README.md')
    expect(inRepository('grep -r todo src/repo/')).toBe('grep -r todo src/repo/')
  })
})
