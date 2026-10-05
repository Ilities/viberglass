import type { RunEvent } from '@/service/api/job-api'

export interface ToolCallStep {
  kind: 'tool'
  id: string
  /** What the harness calls the call: a tool name, or a title like "src/App.jsx". */
  title: string
  /** ACP's kind of tool: read, edit, search, execute… */
  toolKind: string | null
  /** The command, pattern or path it was given, when there's one worth showing. */
  detail: string | null
  locations: string[]
  status: 'running' | 'done' | 'failed'
  output: string
}

export type TranscriptStep =
  | { kind: 'said'; id: string; text: string }
  | { kind: 'thought'; id: string; text: string }
  | { kind: 'note'; id: string; text: string }
  | ToolCallStep

function text(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? Object.fromEntries(Object.entries(value)) : {}
}

/** The one input that says what a call did: the command it ran, what it searched for, the file it opened. */
const DETAIL_KEYS = ['command', 'pattern', 'query', 'url', 'filePath', 'file_path', 'path'] as const

function detailOf(input: Record<string, unknown>): string | null {
  for (const key of DETAIL_KEYS) {
    const value = input[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * A run's events as the steps a person reads: what the agent said and
 * thought, chunks joined up, and each tool call once, with its latest title
 * and input and how it ended.
 */
export function buildRunTranscript(events: RunEvent[]): TranscriptStep[] {
  const steps: TranscriptStep[] = []
  const tools = new Map<string, ToolCallStep>()

  for (const event of events) {
    const payload = record(event.payloadJson)
    const last = steps.at(-1)
    switch (event.eventType) {
      case 'assistant_message':
      case 'reasoning': {
        const kind = event.eventType === 'assistant_message' ? 'said' : 'thought'
        if (last && last.kind === kind) last.text += text(payload.text)
        else steps.push({ kind, id: event.id, text: text(payload.text) })
        break
      }
      case 'progress': {
        const note = text(payload.text) || text(payload.message)
        if (note) steps.push({ kind: 'note', id: event.id, text: note })
        break
      }
      case 'tool_call_started': {
        const id = text(payload.toolCallId) || event.id
        const input = record(payload.input)
        const known = tools.get(id)
        const title = text(payload.toolName) || known?.title || 'Tool call'
        const update = {
          title,
          toolKind: text(payload.kind) || known?.toolKind || null,
          detail: detailOf(input) ?? known?.detail ?? null,
          locations: stringList(payload.locations).length > 0 ? stringList(payload.locations) : (known?.locations ?? []),
        }
        if (known) Object.assign(known, update)
        else {
          const step: ToolCallStep = { kind: 'tool', id, status: 'running', output: '', ...update }
          tools.set(id, step)
          steps.push(step)
        }
        break
      }
      case 'tool_call_completed': {
        const id = text(payload.toolCallId)
        const step = id ? tools.get(id) : undefined
        const success = payload.success !== false
        const output = success ? text(payload.output) : text(payload.error)
        // A harness can finish a call it never announced.
        const target = step ?? { kind: 'tool' as const, id: id || event.id, title: text(payload.toolName) || 'Tool call', toolKind: null, detail: null, locations: [], status: 'running' as const, output: '' }
        if (!step) steps.push(target)
        target.status = success ? 'done' : 'failed'
        target.output = output
        const title = text(payload.toolName)
        // OpenCode's finished call is titled with what it worked on, which reads better than the tool's name.
        if (title && title !== target.title && !target.detail) target.detail = title
        break
      }
    }
  }
  return steps
}

/** "39 tool calls", for the details line. */
export function toolCallCount(steps: TranscriptStep[]): number {
  return steps.filter((step) => step.kind === 'tool').length
}
