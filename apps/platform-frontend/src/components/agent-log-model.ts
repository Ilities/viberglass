import type { LogEntry } from '@/service/api/job-api'

const AGENT_LOG_PATTERN = /^\[agent:([a-zA-Z0-9._-]+):(stdout|stderr)\]\s*(.*)$/

type AgentStream = 'stdout' | 'stderr'
type CommandState = 'running' | 'completed' | 'failed'

interface TimelineBase {
  id: string
  createdAt: string
  level: LogEntry['level']
  sourceLabel: string
}

export interface AgentMessageTimelineEvent extends TimelineBase {
  kind: 'agent_message'
  agentName: string
  text: string
}

export interface ReasoningTimelineEvent extends TimelineBase {
  kind: 'reasoning'
  agentName: string
  text: string
}

export interface CommandExecutionTimelineEvent extends TimelineBase {
  kind: 'command_execution'
  agentName: string
  stream: AgentStream
  commandId: string
  command: string
  output: string
  exitCode: number | null
  status: string | null
  state: CommandState
  startedAt: string | null
  completedAt: string | null
}

export interface FileChangeTimelineEvent extends TimelineBase {
  kind: 'file_change'
  agentName: string
  changes: Array<{ path: string; kind: string }>
}

export interface RawTimelineEvent extends TimelineBase {
  kind: 'raw'
  text: string
}

export type TimelineEvent =
  | AgentMessageTimelineEvent
  | ReasoningTimelineEvent
  | CommandExecutionTimelineEvent
  | FileChangeTimelineEvent
  | RawTimelineEvent

interface ParsedAgentEnvelope {
  agentName: string
  stream: AgentStream
  payload: string
}

interface ParsedItemPayload {
  type: string | null
  item: Record<string, unknown> | null
  raw: string
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readText(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

function readObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, itemValue] of Object.entries(value)) {
    normalized[key] = itemValue
  }
  return normalized
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' ? value : null
}

function parseAgentEnvelope(message: string): ParsedAgentEnvelope | null {
  const match = message.trim().match(AGENT_LOG_PATTERN)
  if (!match) {
    return null
  }

  const [, agentName, stream, payload = ''] = match
  if (stream !== 'stdout' && stream !== 'stderr') {
    return null
  }

  return {
    agentName,
    stream,
    payload: payload.trim(),
  }
}

function parseItemPayload(payload: string): ParsedItemPayload | null {
  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(payload)
    const data = readObject(parsed)
    if (!data) {
      return null
    }

    return {
      type: readString(data.type),
      item: readObject(data.item),
      raw: payload,
    }
  } catch {
    return null
  }
}

function toCommandState(status: string | null, exitCode: number | null): CommandState {
  if (status === 'failed') {
    return 'failed'
  }
  if (typeof exitCode === 'number' && exitCode !== 0) {
    return 'failed'
  }
  if (status === 'completed') {
    return 'completed'
  }
  return 'running'
}

function commandStateRank(state: CommandState): number {
  if (state === 'running') return 0
  if (state === 'completed') return 1
  return 2
}

function maxLevel(a: LogEntry['level'], b: LogEntry['level']): LogEntry['level'] {
  const rank: Record<LogEntry['level'], number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  }
  return rank[a] >= rank[b] ? a : b
}

function buildRawEvent(log: LogEntry, text?: string): RawTimelineEvent {
  const sourceLabel = readString(log.source) ?? 'viberator'
  return {
    kind: 'raw',
    id: log.id,
    createdAt: log.createdAt,
    level: log.level,
    sourceLabel,
    text: text ?? log.message,
  }
}

export function buildLogTimeline(logs: LogEntry[]): TimelineEvent[] {
  if (!logs || logs.length === 0) {
    return []
  }

  const sortedLogs = logs
    .map((log, index) => ({ log, index }))
    .sort((a, b) => {
      const timeA = new Date(a.log.createdAt).getTime()
      const timeB = new Date(b.log.createdAt).getTime()
      if (timeA === timeB) {
        return a.index - b.index
      }
      return timeA - timeB
    })
    .map(({ log }) => log)

  const timeline: TimelineEvent[] = []
  const commandIndexById = new Map<string, number>()

  for (const log of sortedLogs) {
    const envelope = parseAgentEnvelope(log.message)
    if (!envelope) {
      timeline.push(buildRawEvent(log))
      continue
    }

    const itemPayload = parseItemPayload(envelope.payload)
    if (!itemPayload || !itemPayload.item) {
      timeline.push(
        buildRawEvent(
          log,
          envelope.payload || `[agent:${envelope.agentName}:${envelope.stream}]`,
        ),
      )
      continue
    }

    const item = itemPayload.item
    const itemId = readString(item.id)
    const itemType = readString(item.type)
    const itemText = readString(item.text)
    const itemMessage = readString(item.message)

    if (itemType === 'command_execution') {
      const commandId = itemId ?? `command-${log.id}`
      const command = readString(item.command) ?? '(command unavailable)'
      const output = readText(item.aggregated_output) ?? ''
      const status = readString(item.status)
      const exitCode = readNumber(item.exit_code)
      const state = toCommandState(status, exitCode)

      const existingIndex = commandIndexById.get(commandId)
      if (existingIndex === undefined) {
        timeline.push({
          kind: 'command_execution',
          id: `command-${commandId}`,
          commandId,
          createdAt: log.createdAt,
          startedAt: itemPayload.type === 'item.started' ? log.createdAt : null,
          completedAt: itemPayload.type === 'item.completed' ? log.createdAt : null,
          level: log.level,
          sourceLabel: `agent:${envelope.agentName}`,
          agentName: envelope.agentName,
          stream: envelope.stream,
          command,
          output,
          exitCode,
          status,
          state,
        })
        commandIndexById.set(commandId, timeline.length - 1)
        continue
      }

      const existing = timeline[existingIndex]
      if (existing.kind !== 'command_execution') {
        continue
      }

      const mergedState =
        commandStateRank(existing.state) >= commandStateRank(state) ? existing.state : state

      timeline[existingIndex] = {
        ...existing,
        command: command || existing.command,
        output: output.length >= existing.output.length ? output : existing.output,
        exitCode: exitCode ?? existing.exitCode,
        status: status ?? existing.status,
        state: mergedState,
        level: maxLevel(existing.level, log.level),
        startedAt:
          existing.startedAt ??
          (itemPayload.type === 'item.started' || status === 'in_progress' ? log.createdAt : null),
        completedAt:
          itemPayload.type === 'item.completed'
            ? log.createdAt
            : existing.completedAt ??
              (mergedState !== 'running' && itemPayload.type !== 'item.started' ? log.createdAt : null),
      }
      continue
    }

    if (itemType === 'reasoning') {
      timeline.push({
        kind: 'reasoning',
        id: itemId ?? log.id,
        createdAt: log.createdAt,
        level: log.level,
        sourceLabel: `agent:${envelope.agentName}`,
        agentName: envelope.agentName,
        text: itemText ?? itemMessage ?? itemPayload.raw,
      })
      continue
    }

    if (itemType === 'agent_message') {
      timeline.push({
        kind: 'agent_message',
        id: itemId ?? log.id,
        createdAt: log.createdAt,
        level: log.level,
        sourceLabel: `agent:${envelope.agentName}`,
        agentName: envelope.agentName,
        text: itemText ?? itemMessage ?? itemPayload.raw,
      })
      continue
    }

    if (itemType === 'file_change') {
      const rawChanges = Array.isArray(item.changes) ? item.changes : []
      const changes = rawChanges
        .map((candidate) => {
          const data = readObject(candidate)
          if (!data) return null
          const path = readString(data.path)
          const kind = readString(data.kind)
          if (!path || !kind) return null
          return { path, kind }
        })
        .filter((value): value is { path: string; kind: string } => Boolean(value))

      timeline.push({
        kind: 'file_change',
        id: itemId ?? log.id,
        createdAt: log.createdAt,
        level: log.level,
        sourceLabel: `agent:${envelope.agentName}`,
        agentName: envelope.agentName,
        changes,
      })
      continue
    }

    timeline.push(buildRawEvent(log, itemText ?? itemMessage ?? itemPayload.raw))
  }

  return timeline
}
