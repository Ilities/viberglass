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
  // Full parsed object — needed for Responses API format where there is no `item` wrapper
  data: Record<string, unknown>
  raw: string
}

interface ParsedStructuredLog {
  itemPayload: ParsedItemPayload
  sourceLabel: string
  agentName: string
  stream: AgentStream
  rawFallback: string
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

function inferStream(level: LogEntry['level']): AgentStream {
  return level === 'error' ? 'stderr' : 'stdout'
}

function parseAgentNameFromSource(source: string | null | undefined): string | null {
  if (!source) return null
  const value = source.trim()
  if (!value.startsWith('agent:')) return null
  const parsed = value.slice('agent:'.length).trim()
  return parsed.length > 0 ? parsed : null
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
      data,
      raw: payload,
    }
  } catch {
    return null
  }
}

function parseStructuredLog(log: LogEntry): ParsedStructuredLog | null {
  const sourceLabel = readString(log.source) ?? 'viberator'
  const envelope = parseAgentEnvelope(log.message)

  if (envelope) {
    const itemPayload = parseItemPayload(envelope.payload)
    if (!itemPayload) return null

    return {
      itemPayload,
      sourceLabel: `agent:${envelope.agentName}`,
      agentName: envelope.agentName,
      stream: envelope.stream,
      rawFallback: envelope.payload || `[agent:${envelope.agentName}:${envelope.stream}]`,
    }
  }

  const directPayload = parseItemPayload(log.message.trim())
  if (!directPayload) {
    return null
  }

  const item = directPayload.item
  const payloadAgentName = item
    ? readString(item.agent_name) ?? readString(item.agentName) ?? readString(item.agent)
    : null
  const sourceAgentName = parseAgentNameFromSource(log.source)
  const agentName = payloadAgentName ?? sourceAgentName ?? 'agent'
  const resolvedSourceLabel = sourceAgentName ? `agent:${sourceAgentName}` : sourceLabel

  return {
    itemPayload: directPayload,
    sourceLabel: resolvedSourceLabel,
    agentName,
    stream: inferStream(log.level),
    rawFallback: directPayload.raw,
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

// Extract content blocks from both flat {"content":[...]} and nested {"message":{"content":[...]}} forms
function extractContentBlocks(data: Record<string, unknown>): Array<Record<string, unknown>> | null {
  const isObj = (v: unknown): v is Record<string, unknown> =>
    v !== null && typeof v === 'object' && !Array.isArray(v)

  if (Array.isArray(data.content)) {
    return (data.content as unknown[]).filter(isObj)
  }
  const msg = data.message
  if (isObj(msg) && Array.isArray(msg.content)) {
    return (msg.content as unknown[]).filter(isObj)
  }
  return null
}

// Build a human-readable command string from a tool_use block
function formatToolCommand(name: string, input: Record<string, unknown>): string {
  // run_shell_command / bash: show the actual command
  const cmd = readString(input.command) ?? readString(input.cmd)
  if (cmd) return cmd

  // File operations: show the path
  const filePath =
    readString(input.absolute_path) ??
    readString(input.path) ??
    readString(input.file_path) ??
    readString(input.notebook_path)
  if (filePath) return `${name} ${filePath}`

  // Search/glob: show the pattern or query
  const pattern = readString(input.pattern) ?? readString(input.query) ?? readString(input.glob)
  if (pattern) return `${name} ${pattern}`

  // URL-based tools
  const url = readString(input.url)
  if (url) return `${name} ${url}`

  return name
}

// Pre-scan all logs to collect tool_use definitions (id → name + input) from assistant events.
// Used so orphaned tool results (sorted before their matching assistant event) still show a command name.
function collectToolUseDefinitions(
  logs: LogEntry[],
): Map<string, { name: string; input: Record<string, unknown> }> {
  const defs = new Map<string, { name: string; input: Record<string, unknown> }>()

  for (const log of logs) {
    const envelope = parseAgentEnvelope(log.message)
    const rawPayload = envelope ? envelope.payload : log.message.trim()
    let data: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(rawPayload)
      data = readObject(parsed)
    } catch {
      continue
    }
    if (!data || readString(data.type) !== 'assistant') continue

    const blocks = extractContentBlocks(data)
    if (!blocks) continue

    for (const block of blocks) {
      if (readString(block.type) !== 'tool_use') continue
      const id = readString(block.id)
      const name = readString(block.name) ?? '(unknown tool)'
      const input = readObject(block.input) ?? {}
      if (id) defs.set(id, { name, input })
    }
  }

  return defs
}

/**
 * Handle a Responses API event (assistant/user/result/system format used by qwen-cli, kimi, etc.)
 * Pushes 0 or more timeline events and updates commandIndexById.
 * Returns true if the event was recognized and handled (even if nothing was pushed).
 */
function handleResponsesApiEvent(
  log: LogEntry,
  sourceLabel: string,
  agentName: string,
  data: Record<string, unknown>,
  timeline: TimelineEvent[],
  commandIndexById: Map<string, number>,
  toolUseDefs: Map<string, { name: string; input: Record<string, unknown> }>,
): boolean {
  const eventType = readString(data.type)
  if (!eventType) return false

  // Initialization event — no user value
  if (eventType === 'system') return true

  // Final result summary — emit as an agent message if there's meaningful text
  if (eventType === 'result') {
    const text = readString(data.result)
    if (text) {
      timeline.push({
        kind: 'agent_message',
        id: `${log.id}-result`,
        createdAt: log.createdAt,
        level: log.level,
        sourceLabel,
        agentName,
        text,
      })
    }
    return true
  }

  // Assistant turn: text messages, thinking blocks, and tool calls
  if (eventType === 'assistant') {
    const blocks = extractContentBlocks(data)
    if (!blocks) return false

    for (const block of blocks) {
      const blockType = readString(block.type)

      if (blockType === 'text') {
        const text = readString(block.text)
        if (text) {
          timeline.push({
            kind: 'agent_message',
            id: `${log.id}-text`,
            createdAt: log.createdAt,
            level: log.level,
            sourceLabel,
            agentName,
            text,
          })
        }
      } else if (blockType === 'thinking') {
        const text = readString(block.thinking)
        if (text) {
          timeline.push({
            kind: 'reasoning',
            id: `${log.id}-thinking`,
            createdAt: log.createdAt,
            level: log.level,
            sourceLabel,
            agentName,
            text,
          })
        }
      } else if (blockType === 'tool_use') {
        const toolId = readString(block.id)
        const toolName = readString(block.name) ?? '(unknown tool)'
        const inputObj = readObject(block.input) ?? {}
        const command = formatToolCommand(toolName, inputObj)
        const commandId = toolId ?? `${log.id}-tool`

        if (!commandIndexById.has(commandId)) {
          timeline.push({
            kind: 'command_execution',
            id: `command-${commandId}`,
            commandId,
            createdAt: log.createdAt,
            startedAt: log.createdAt,
            completedAt: null,
            level: log.level,
            sourceLabel,
            agentName,
            stream: 'stdout',
            command,
            output: '',
            exitCode: null,
            status: 'in_progress',
            state: 'running',
          })
          commandIndexById.set(commandId, timeline.length - 1)
        }
      }
    }
    return true
  }

  // User turn: tool results — find and complete the matching tool call
  if (eventType === 'user') {
    const blocks = extractContentBlocks(data)
    if (!blocks) return true

    for (const block of blocks) {
      if (readString(block.type) !== 'tool_result') continue

      const toolUseId = readString(block.tool_use_id)
      if (!toolUseId) continue

      const output = readText(block.content) ?? ''
      const isError = Boolean(block.is_error)
      const state: CommandState = isError ? 'failed' : 'completed'

      const existingIndex = commandIndexById.get(toolUseId)
      if (existingIndex !== undefined) {
        const existing = timeline[existingIndex]
        if (existing.kind === 'command_execution') {
          timeline[existingIndex] = {
            ...existing,
            output,
            exitCode: isError ? 1 : 0,
            state,
            status: state,
            completedAt: log.createdAt,
            level: maxLevel(existing.level, log.level),
          }
        }
      } else {
        // Orphaned result — look up the tool definition to get the real command name
        const def = toolUseDefs.get(toolUseId)
        const command = def ? formatToolCommand(def.name, def.input) : '(unknown tool)'
        timeline.push({
          kind: 'command_execution',
          id: `command-${toolUseId}`,
          commandId: toolUseId,
          createdAt: log.createdAt,
          startedAt: null,
          completedAt: log.createdAt,
          level: log.level,
          sourceLabel,
          agentName,
          stream: 'stdout',
          command,
          output,
          exitCode: isError ? 1 : 0,
          status: state,
          state,
        })
        commandIndexById.set(toolUseId, timeline.length - 1)
      }
    }
    return true
  }

  return false
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
  const toolUseDefs = collectToolUseDefinitions(logs)

  for (const log of sortedLogs) {
    const structuredLog = parseStructuredLog(log)
    if (!structuredLog) {
      timeline.push(buildRawEvent(log))
      continue
    }

    const { itemPayload, sourceLabel, agentName, stream, rawFallback } = structuredLog

    // No viberator `item` wrapper — try Responses API format (assistant/user/result/system)
    if (!itemPayload.item) {
      const handled = handleResponsesApiEvent(
        log,
        sourceLabel,
        agentName,
        itemPayload.data,
        timeline,
        commandIndexById,
        toolUseDefs,
      )
      if (!handled) {
        timeline.push(buildRawEvent(log, rawFallback))
      }
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
          sourceLabel,
          agentName,
          stream,
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
        sourceLabel,
        agentName,
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
        sourceLabel,
        agentName,
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
        sourceLabel,
        agentName,
        changes,
      })
      continue
    }

    timeline.push(buildRawEvent(log, itemText ?? itemMessage ?? itemPayload.raw))
  }

  return timeline
}
