import { Agent, AgentAction, AgentMessage, AgentObservation, AgentThinking } from '@/components/ai-elements/agent'
import { Subheading } from '@/components/heading'
import {
  type CommandExecutionTimelineEvent,
  buildLogTimeline,
} from '@/components/agent-log-model'
import type { LogEntry } from '@/service/api/job-api'
import { LayersIcon } from '@radix-ui/react-icons'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface LogViewerProps {
  logs: LogEntry[]
  isConnected?: boolean
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

function getToolState(event: CommandExecutionTimelineEvent): 'input-streaming' | 'output-available' | 'output-error' {
  if (event.state === 'running') {
    return 'input-streaming'
  }
  if (event.state === 'failed') {
    return 'output-error'
  }
  return 'output-available'
}

/**
 * AI Elements-based job log viewer.
 */
export function LogViewer({ logs, isConnected = false }: LogViewerProps) {
  const timeline = useMemo(() => buildLogTimeline(logs), [logs])
  const [expandedCommands, setExpandedCommands] = useState<Set<string>>(new Set())
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
              {timeline.map((event) => {
                if (event.kind === 'agent_message') {
                  return (
                    <AgentMessage key={event.id}>
                      <div className="mb-1 font-mono text-[10px] text-[var(--gray-9)]">
                        {event.sourceLabel} · {formatTime(event.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap break-words leading-relaxed">{event.text}</p>
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
                  const shouldExpand =
                    event.state === 'running' || event.state === 'failed' || expandedCommands.has(event.commandId)
                  const outputText = event.output || (event.state === 'running' ? 'Waiting for command output...' : '')
                  const clipped =
                    outputText.length > 1400 && !shouldExpand ? `${outputText.slice(0, 1400)}\n...` : outputText

                  return (
                    <AgentAction
                      key={event.id}
                      state={toolState}
                      title={`${event.sourceLabel} · ${formatTime(event.createdAt)} · ${
                        event.exitCode !== null ? `exit ${event.exitCode}` : event.state
                      }`}
                    >
                      <pre className="overflow-x-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-[var(--gray-12)]">
                        {event.command}
                      </pre>
                      <pre className="max-h-80 overflow-auto rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-2 font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words text-[var(--gray-12)]">
                        {clipped || '(no output)'}
                      </pre>
                      {outputText.length > 1400 && (
                        <button
                          type="button"
                          onClick={() => toggleCommand(event.commandId)}
                          className="self-start rounded border border-[var(--gray-6)] px-2 py-1 font-mono text-[10px] font-medium text-[var(--gray-11)] transition hover:bg-[var(--gray-3)]"
                        >
                          {shouldExpand ? 'Collapse output' : 'Expand output'}
                        </button>
                      )}
                    </AgentAction>
                  )
                }

                if (event.kind === 'file_change') {
                  return (
                    <AgentObservation
                      key={event.id}
                      title={`${event.sourceLabel} · file changes · ${formatTime(event.createdAt)}`}
                    >
                      {event.changes.length > 0
                        ? event.changes.map((change) => `${change.kind.toUpperCase()} ${change.path}`).join('\n')
                        : 'No file change details provided'}
                    </AgentObservation>
                  )
                }

                return (
                  <AgentObservation
                    key={event.id}
                    state={event.level === 'error' ? 'output-error' : 'output-available'}
                    title={`${event.sourceLabel} · ${event.level.toUpperCase()} · ${formatTime(event.createdAt)}`}
                  >
                    {event.text}
                  </AgentObservation>
                )
              })}
            </Agent>
          </div>
        </div>
      )}
    </div>
  )
}
