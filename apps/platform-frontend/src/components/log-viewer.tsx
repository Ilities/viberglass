import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import type { LogEntry } from '@/service/api/job-api'
import { LayersIcon } from '@radix-ui/react-icons'

export interface LogViewerProps {
  logs: LogEntry[]
  isConnected?: boolean
}

type BadgeTone = NonNullable<Parameters<typeof Badge>[0]['color']>

const AGENT_LOG_PATTERN = /^\[agent:([a-zA-Z0-9._-]+):(stdout|stderr)\]\s*(.*)$/
const MAX_DETAIL_LENGTH = 500

interface ParsedLogLine {
  originLabel: string
  originTone: BadgeTone
  streamLabel: string | null
  streamTone: BadgeTone | null
  eventLabel: string | null
  detail: string
}

/**
 * Format timestamp to HH:MM:SS
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

/**
 * Color mapping for log levels
 */
const levelConfig: Record<
  LogEntry['level'],
  { color: Parameters<typeof Badge>[0]['color']; label: string; bgColor: string }
> = {
  info: { color: 'zinc', label: 'INFO', bgColor: 'bg-[var(--gray-4)]' },
  warn: { color: 'amber', label: 'WARN', bgColor: 'bg-amber-100 dark:bg-amber-900/30' },
  error: { color: 'red', label: 'ERROR', bgColor: 'bg-red-100 dark:bg-red-900/30' },
  debug: { color: 'zinc', label: 'DEBUG', bgColor: 'bg-[var(--gray-4)]' },
}

function readStringField(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function readObjectField(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }

  const normalized: Record<string, unknown> = {}
  for (const [key, itemValue] of Object.entries(value)) {
    normalized[key] = itemValue
  }
  return normalized
}

function truncateDetail(value: string): string {
  if (value.length <= MAX_DETAIL_LENGTH) {
    return value
  }
  return `${value.slice(0, MAX_DETAIL_LENGTH - 3)}...`
}

function tryFormatAgentPayload(payload: string): { eventLabel: string | null; detail: string } {
  if (!payload) {
    return { eventLabel: null, detail: 'Agent output' }
  }

  try {
    const parsed = JSON.parse(payload)
    const data = readObjectField(parsed)
    if (!data) {
      return { eventLabel: null, detail: truncateDetail(payload) }
    }

    const eventType = readStringField(data.type)
    const item = readObjectField(data.item)
    const itemType = item ? readStringField(item.type) : null
    const itemText = item ? readStringField(item.text) : null
    const messageText = readStringField(data.message)
    const threadId = readStringField(data.thread_id)

    const eventLabel = [eventType, itemType].filter(Boolean).join(' · ') || null
    const detail =
      itemText ||
      messageText ||
      (threadId ? `thread_id: ${threadId}` : null) ||
      truncateDetail(JSON.stringify(data))

    return { eventLabel, detail: truncateDetail(detail) }
  } catch {
    return { eventLabel: null, detail: truncateDetail(payload) }
  }
}

export function parseLogEntryForDisplay(log: LogEntry): ParsedLogLine {
  const message = log.message.trim()
  const agentMatch = message.match(AGENT_LOG_PATTERN)

  if (agentMatch) {
    const [, agentName, stream, payload = ''] = agentMatch
    const streamLabel = stream.toUpperCase()
    const streamTone: BadgeTone = stream === 'stderr' ? 'amber' : 'sky'
    const formattedPayload = tryFormatAgentPayload(payload.trim())
    return {
      originLabel: `agent:${agentName}`,
      originTone: 'sky',
      streamLabel,
      streamTone,
      eventLabel: formattedPayload.eventLabel,
      detail: formattedPayload.detail,
    }
  }

  const source = readStringField(log.source)
  if (source && source !== 'viberator') {
    return {
      originLabel: source,
      originTone: 'teal',
      streamLabel: null,
      streamTone: null,
      eventLabel: null,
      detail: message,
    }
  }

  return {
    originLabel: 'viberator',
    originTone: 'zinc',
    streamLabel: null,
    streamTone: null,
    eventLabel: null,
    detail: message,
  }
}

/**
 * Log viewer component with color-coded log levels and live indicator
 */
export function LogViewer({ logs, isConnected = false }: LogViewerProps) {
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <Subheading className="flex items-center gap-2">
          <LayersIcon className="h-5 w-5 text-[var(--accent-9)]" />
          Execution Logs
        </Subheading>
        {isConnected && (
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            <span className="text-xs font-medium text-green-600">Live</span>
          </div>
        )}
      </div>

      {!logs || logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center p-8 text-center">
          <div className="text-[var(--gray-9)]">
            <LayersIcon className="h-10 w-10 mx-auto mb-3 text-[var(--gray-6)]" />
            <p className="text-sm">No logs available</p>
            <p className="text-xs mt-1 text-[var(--gray-8)]">Logs will appear here once the job starts</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] dark:bg-[var(--gray-3)]">
          <div className="overflow-auto max-h-[600px]">
            <table className="w-full text-sm">
              <tbody>
                {logs.map((log, index) => {
                  const config = levelConfig[log.level]
                  const isEven = index % 2 === 0
                  const parsedLine = parseLogEntryForDisplay(log)
                  return (
                    <tr 
                      key={log.id} 
                      className={`
                        ${isEven ? 'bg-transparent' : 'bg-[var(--gray-3)]/50 dark:bg-[var(--gray-4)]/30'}
                        hover:bg-[var(--accent-3)]/30 transition-colors
                      `}
                    >
                      <td className="py-2 px-4 text-[var(--gray-8)] tabular-nums text-xs whitespace-nowrap w-20">
                        {formatTime(log.createdAt)}
                      </td>
                      <td className="py-2 px-2 w-16">
                        <Badge 
                          color={config.color} 
                          className={`
                            text-[10px] px-1.5 py-0.5 font-mono font-bold
                            ${config.bgColor}
                          `}
                        >
                          {config.label}
                        </Badge>
                      </td>
                      <td className="py-2 px-4 text-[var(--gray-11)]">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge color={parsedLine.originTone} className="px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                              {parsedLine.originLabel}
                            </Badge>
                            {parsedLine.streamLabel && parsedLine.streamTone && (
                              <Badge color={parsedLine.streamTone} className="px-1.5 py-0.5 font-mono text-[10px] font-semibold">
                                {parsedLine.streamLabel}
                              </Badge>
                            )}
                            {parsedLine.eventLabel && (
                              <span className="font-mono text-[11px] text-[var(--gray-9)]">
                                {parsedLine.eventLabel}
                              </span>
                            )}
                          </div>
                          <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                            {parsedLine.detail}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
