import { Agent, AgentAction, AgentMessage, AgentObservation, AgentThinking } from '@/components/ai-elements/agent'
import { Subheading } from '@/components/heading'
import {
  type CommandExecutionTimelineEvent,
  type TimelineEvent,
  buildLogTimeline,
} from '@/components/agent-log-model'
import type { LogEntry } from '@/service/api/job-api'
import { LayersIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface LogViewerProps {
  logs: LogEntry[]
  isConnected?: boolean
}

const COMMAND_OUTPUT_PREVIEW_LIMIT = 420
const RAW_OUTPUT_PREVIEW_LIMIT = 300
const COMMAND_BATCH_MIN_SIZE = 2
const COMMAND_BATCH_MAX_GAP_MS = 120_000

type DisplayEntry = { kind: 'event'; event: TimelineEvent } | CommandBatchDisplayEntry

interface CommandBatchDisplayEntry {
  kind: 'command_batch'
  id: string
  sourceLabel: string
  createdAt: string
  completedAt: string
  events: CommandExecutionTimelineEvent[]
}

/**
 * Format timestamp to HH:MM:SS
 */
function formatTime(isoString: string): string {
  const date = new Date(isoString)
  return date.toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getToolState(event: CommandExecutionTimelineEvent): 'input-streaming' | 'output-available' | 'output-error' {
  if (event.state === 'running') {
    return 'input-streaming'
  }
  if (event.state === 'failed') {
    return 'output-error'
  }
  return 'output-available'
}

function clipText(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n...`
}

function oneLine(value: string, limit = 150): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

function timestampMs(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

function buildDisplayEntries(timeline: TimelineEvent[]): DisplayEntry[] {
  const entries: DisplayEntry[] = []
  let index = 0

  while (index < timeline.length) {
    const current = timeline[index]
    if (current.kind !== 'command_execution' || current.state !== 'completed') {
      entries.push({ kind: 'event', event: current })
      index += 1
      continue
    }

    const batch: CommandExecutionTimelineEvent[] = [current]
    let cursor = index + 1

    while (cursor < timeline.length) {
      const candidate = timeline[cursor]
      if (candidate.kind !== 'command_execution') break
      if (candidate.state !== 'completed') break
      if (candidate.sourceLabel !== current.sourceLabel) break

      const gapMs = timestampMs(candidate.createdAt) - timestampMs(batch[batch.length - 1].createdAt)
      if (gapMs > COMMAND_BATCH_MAX_GAP_MS) break

      batch.push(candidate)
      cursor += 1
    }

    if (batch.length >= COMMAND_BATCH_MIN_SIZE) {
      const last = batch[batch.length - 1]
      entries.push({
        kind: 'command_batch',
        id: `batch-${current.id}`,
        sourceLabel: current.sourceLabel,
        createdAt: current.createdAt,
        completedAt: last.completedAt ?? last.createdAt,
        events: batch,
      })
      index = cursor
      continue
    }

    entries.push({ kind: 'event', event: current })
    index += 1
  }

  return entries
}

/**
 * AI Elements-based job log viewer.
 */
export function LogViewer({ logs, isConnected = false }: LogViewerProps) {
  const timeline = useMemo(() => buildLogTimeline(logs), [logs])
  const displayEntries = useMemo(() => buildDisplayEntries(timeline), [timeline])
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set())
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set())
  const [expandedRawOutput, setExpandedRawOutput] = useState<Set<string>>(new Set())
  const [isFollowingOutput, setIsFollowingOutput] = useState(true)
  const timelineRef = useRef<HTMLDivElement | null>(null)

  const commandCount = timeline.filter((entry) => entry.kind === 'command_execution').length
  const failedCount = timeline.filter(
    (entry) => (entry.kind === 'command_execution' && entry.state === 'failed') || entry.level === 'error',
  ).length

  useEffect(() => {
    if (!isFollowingOutput) {
      return
    }
    const container = timelineRef.current
    if (!container) {
      return
    }
    container.scrollTop = container.scrollHeight
  }, [timeline, isFollowingOutput])

  function handleTimelineScroll() {
    const container = timelineRef.current
    if (!container) return
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
    setIsFollowingOutput(distanceFromBottom < 48)
  }

  function toggleCommand(commandId: string) {
    setExpandedCommands((previous) => {
      const next = new Set(previous)
      if (next.has(commandId)) {
        next.delete(commandId)
      } else {
        next.add(commandId)
      }
      return next
    })
  }

  function toggleEntry(entryId: string) {
    setExpandedEntries((previous) => {
      const next = new Set(previous)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  function toggleRawOutput(entryId: string) {
    setExpandedRawOutput((previous) => {
      const next = new Set(previous)
      if (next.has(entryId)) {
        next.delete(entryId)
      } else {
        next.add(entryId)
      }
      return next
    })
  }

  function jumpToLatest() {
    const container = timelineRef.current
    if (!container) return
    container.scrollTop = container.scrollHeight
    setIsFollowingOutput(true)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between mb-4">
        <Subheading className="flex items-center gap-2">
          <LayersIcon className="h-5 w-5 text-[var(--accent-9)]" />
          Execution Logs
        </Subheading>
        <div className="flex items-center gap-3 text-xs text-[var(--gray-10)]">
          <span>{timeline.length} events</span>
          <span>{commandCount} commands</span>
          {failedCount > 0 && <span className="font-medium text-red-600">{failedCount} failed</span>}
          {isConnected && (
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500"></span>
              </span>
              <span className="font-medium text-green-600">Live</span>
            </div>
          )}
          {!isFollowingOutput && (
            <button
              type="button"
              onClick={jumpToLatest}
              className="sticky bottom-3 self-center rounded-full border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-1 text-xs font-medium text-[var(--gray-11)] shadow-sm transition hover:bg-[var(--gray-3)]"
            >
              Follow output
            </button>
          )}
        </div>
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
          <div ref={timelineRef} onScroll={handleTimelineScroll} className="h-full overflow-auto p-3">
            <Agent>
              {displayEntries.map((entry) => {
                if (entry.kind === 'command_batch') {
                  const detailsId = `batch:${entry.id}`
                  const outputId = `batch-output:${entry.id}`
                  const isExpanded = expandedEntries.has(detailsId)
                  const isOutputExpanded = expandedRawOutput.has(outputId)
                  const combinedOutput = entry.events
                    .map((commandEvent) => {
                      const output = commandEvent.output || '(no output)'
                      return `$ ${commandEvent.command}\n${output}`
                    })
                    .join('\n\n')

                  return (
                    <AgentAction
                      key={entry.id}
                      state="output-available"
                      title={`${entry.sourceLabel} · ${formatTime(entry.createdAt)}-${formatTime(entry.completedAt)} · ${entry.events.length} tool calls`}
                    >
                      <div className="font-mono text-[11px] text-[var(--gray-11)]">
                        {entry.events
                          .slice(0, 3)
                          .map((commandEvent) => oneLine(commandEvent.command, 120))
                          .join('\n')}
                        {entry.events.length > 3 ? `\n+ ${entry.events.length - 3} more` : ''}
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleEntry(detailsId)}
                        className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                      >
                        {isExpanded ? 'Hide tool batch details' : 'Show tool batch details'}
                      </button>
                      {isExpanded && (
                        <>
                          <pre className="overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
                            {entry.events
                              .map((commandEvent, commandIndex) => `${commandIndex + 1}. ${commandEvent.command}`)
                              .join('\n')}
                          </pre>
                          <pre className="max-h-80 overflow-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--gray-12)]">
                            {clipText(
                              combinedOutput,
                              isOutputExpanded ? Number.MAX_SAFE_INTEGER : COMMAND_OUTPUT_PREVIEW_LIMIT * 3,
                            )}
                          </pre>
                          {combinedOutput.length > COMMAND_OUTPUT_PREVIEW_LIMIT * 3 && (
                            <button
                              type="button"
                              onClick={() => toggleRawOutput(outputId)}
                              className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                            >
                              {isOutputExpanded ? 'Collapse grouped output' : 'Expand grouped output'}
                            </button>
                          )}
                        </>
                      )}
                    </AgentAction>
                  )
                }

                const event = entry.event

                if (event.kind === 'agent_message') {
                  const entryId = `message:${event.id}`
                  const isExpanded = expandedEntries.has(entryId)
                  const summary = oneLine(event.text, 220)

                  return (
                    <AgentMessage key={event.id}>
                      <div className="mb-1 font-mono text-[10px] text-[var(--gray-9)]">
                        {event.sourceLabel} · {formatTime(event.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{isExpanded ? event.text : summary}</p>
                      {event.text.length > 220 && (
                        <button
                          type="button"
                          onClick={() => toggleEntry(entryId)}
                          className="mt-2 self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                        >
                          {isExpanded ? 'Collapse message' : 'Expand message'}
                        </button>
                      )}
                    </AgentMessage>
                  )
                }

                if (event.kind === 'reasoning') {
                  return (
                    <AgentThinking
                      key={event.id}
                      title={`Reasoning · ${event.sourceLabel} · ${formatTime(event.createdAt)}`}
                    >
                      {event.text}
                    </AgentThinking>
                  )
                }

                if (event.kind === 'command_execution') {
                  const toolState = getToolState(event)
                  const detailsId = `command:${event.commandId}`
                  const isDetailsExpanded = expandedEntries.has(detailsId)
                  const shouldExpand = expandedCommands.has(event.commandId)
                  const outputText = event.output || (event.state === 'running' ? 'Waiting for command output...' : '')
                  const outputLineCount = outputText.length > 0 ? outputText.split('\n').length : 0
                  const clipped =
                    outputText.length > COMMAND_OUTPUT_PREVIEW_LIMIT && !shouldExpand
                      ? clipText(outputText, COMMAND_OUTPUT_PREVIEW_LIMIT)
                      : outputText

                  return (
                    <AgentAction
                      key={event.id}
                      state={toolState}
                      title={`${event.sourceLabel} · ${formatTime(event.createdAt)} · ${
                        event.exitCode !== null ? `exit ${event.exitCode}` : event.state
                      }`}
                    >
                      <p className="font-mono text-[11px] text-[var(--gray-11)]">{oneLine(event.command, 180)}</p>
                      <p className="font-mono text-[10px] text-[var(--gray-9)]">
                        {outputLineCount > 0 ? `${outputLineCount} output lines` : 'No output'}
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleEntry(detailsId)}
                        className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                      >
                        {isDetailsExpanded ? 'Hide command details' : 'Show command details'}
                      </button>
                      {isDetailsExpanded && (
                        <>
                          <pre className="overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
                            {event.command}
                          </pre>
                          <pre className="max-h-80 overflow-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--gray-12)]">
                            {clipped || '(no output)'}
                          </pre>
                        </>
                      )}
                      {outputText.length > COMMAND_OUTPUT_PREVIEW_LIMIT && isDetailsExpanded && (
                        <button
                          type="button"
                          onClick={() => toggleCommand(event.commandId)}
                          className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                        >
                          {shouldExpand ? 'Collapse command output' : 'Expand command output'}
                        </button>
                      )}
                    </AgentAction>
                  )
                }

                if (event.kind === 'file_change') {
                  const entryId = `file-change:${event.id}`
                  const isExpanded = expandedEntries.has(entryId)

                  return (
                    <AgentObservation
                      key={event.id}
                      title={`${event.sourceLabel} · file changes · ${formatTime(event.createdAt)}`}
                    >
                      <p className="font-mono text-[11px] text-[var(--gray-11)]">
                        {event.changes.length} files changed
                      </p>
                      <button
                        type="button"
                        onClick={() => toggleEntry(entryId)}
                        className="mt-2 self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                      >
                        {isExpanded ? 'Hide file list' : 'Show file list'}
                      </button>
                      {isExpanded && (
                        <pre className="mt-2 overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
                          {event.changes.length > 0
                            ? event.changes.map((change) => `${change.kind.toUpperCase()} ${change.path}`).join('\n')
                            : 'No file change details provided'}
                        </pre>
                      )}
                    </AgentObservation>
                  )
                }

                if (event.kind === 'raw') {
                  const entryId = `raw:${event.id}`
                  const outputId = `raw-output:${event.id}`
                  const isExpanded = expandedEntries.has(entryId)
                  const isOutputExpanded = expandedRawOutput.has(outputId)
                  const preview = oneLine(event.text, 220)
                  const displayText = clipText(
                    event.text,
                    isOutputExpanded ? Number.MAX_SAFE_INTEGER : RAW_OUTPUT_PREVIEW_LIMIT,
                  )
                  const hasDetailToggle = displayText !== preview

                  return (
                    <AgentObservation
                      key={event.id}
                      state={event.level === 'error' ? 'output-error' : 'output-available'}
                      title={`${event.sourceLabel} · ${event.level.toUpperCase()} · ${formatTime(event.createdAt)}`}
                    >
                      <p className="font-mono text-[11px] text-[var(--gray-11)]">
                        {isExpanded ? event.text.slice(0, 180).replace(/\s+/g, ' ') : preview}
                      </p>
                      {hasDetailToggle && (
                        <button
                          type="button"
                          onClick={() => toggleEntry(entryId)}
                          className="mt-2 self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                        >
                          {isExpanded ? 'Hide log details' : 'Show log details'}
                        </button>
                      )}
                      {isExpanded && (
                        <>
                          <pre className="mt-2 max-h-80 overflow-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--gray-12)]">
                            {displayText}
                          </pre>
                          {event.text.length > RAW_OUTPUT_PREVIEW_LIMIT && (
                            <button
                              type="button"
                              onClick={() => toggleRawOutput(outputId)}
                              className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                            >
                              {isOutputExpanded ? 'Collapse raw output' : 'Expand raw output'}
                            </button>
                          )}
                        </>
                      )}
                    </AgentObservation>
                  )
                }

                return null
              })}
            </Agent>
          </div>
        </div>
      )}
    </div>
  )
}
