import { Agent } from '@/components/ai-elements/agent'
import { buildLogTimeline } from '@/components/agent-log-model'
import { type EntryCallbacks, renderEntry } from '@/components/log-viewer-entry-renderer'
import {
  type DisplayEntry,
  buildDisplayEntries,
  getEntrySourceLabel,
  getUniqueAgentLabels,
} from '@/components/log-viewer-utils'
import type { LogEntry } from '@/service/api/job-api'
import { LayersIcon, MagnifyingGlassIcon } from '@radix-ui/react-icons'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'

export interface LogViewerProps {
  logs: LogEntry[]
  isConnected?: boolean
}

type FilterKind = 'all' | 'commands' | 'messages' | 'reasoning' | 'files' | 'errors'
const KIND_LABELS: Record<FilterKind, string> = {
  all: 'All',
  commands: 'Commands',
  messages: 'Messages',
  reasoning: 'Reasoning',
  files: 'Files',
  errors: 'Errors',
}

function applyFilters(
  entries: DisplayEntry[],
  filterKind: FilterKind,
  filterAgent: string,
  filterText: string,
): DisplayEntry[] {
  let result = entries

  if (filterKind !== 'all') {
    result = result.filter((entry) => {
      if (entry.kind === 'command_batch') return filterKind === 'commands'
      const { kind } = entry.event
      if (kind === 'command_execution')
        return filterKind === 'commands' || (filterKind === 'errors' && entry.event.state === 'failed')
      if (kind === 'agent_message') return filterKind === 'messages'
      if (kind === 'reasoning') return filterKind === 'reasoning'
      if (kind === 'file_change') return filterKind === 'files'
      if (kind === 'raw') return filterKind === 'errors' && entry.event.level === 'error'
      return false
    })
  }

  if (filterAgent) {
    result = result.filter((entry) => getEntrySourceLabel(entry) === filterAgent)
  }

  if (filterText) {
    const lower = filterText.toLowerCase()
    result = result.filter((entry) => {
      if (entry.kind === 'command_batch')
        return entry.events.some(
          (e) => e.command.toLowerCase().includes(lower) || e.output.toLowerCase().includes(lower),
        )
      const { event } = entry
      if (event.kind === 'command_execution')
        return event.command.toLowerCase().includes(lower) || event.output.toLowerCase().includes(lower)
      if (event.kind === 'agent_message' || event.kind === 'reasoning' || event.kind === 'raw')
        return event.text.toLowerCase().includes(lower)
      return false
    })
  }

  return result
}

export function LogViewer({ logs, isConnected = false }: LogViewerProps) {
  const timeline = useMemo(() => buildLogTimeline(logs), [logs])
  const displayEntries = useMemo(() => buildDisplayEntries(timeline), [timeline])
  const [expandedCmds, setExpandedCmds] = useState<Set<string>>(new Set())
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [rawExpanded, setRawExpanded] = useState<Set<string>>(new Set())
  const [isFollowingOutput, setIsFollowingOutput] = useState(true)
  const [filterText, setFilterText] = useState('')
  const [filterKind, setFilterKind] = useState<FilterKind>('all')
  const [filterAgent, setFilterAgent] = useState('')
  const parentRef = useRef<HTMLDivElement | null>(null)

  const filteredEntries = useMemo(
    () => applyFilters(displayEntries, filterKind, filterAgent, filterText),
    [displayEntries, filterKind, filterAgent, filterText],
  )
  const agentOptions = useMemo(() => getUniqueAgentLabels(displayEntries), [displayEntries])

  const rowVirtualizer = useVirtualizer({
    count: filteredEntries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    measureElement: (el) => el?.getBoundingClientRect().height ?? 72,
    overscan: 5,
    // Fallback height keeps tests working in jsdom where container has 0 height
    initialRect: { width: 0, height: 800 },
  })

  useEffect(() => {
    if (!isFollowingOutput) return
    const c = parentRef.current
    if (!c) return
    c.scrollTop = c.scrollHeight
  }, [filteredEntries, isFollowingOutput])

  function handleScroll() {
    const c = parentRef.current
    if (!c) return
    setIsFollowingOutput(c.scrollHeight - c.scrollTop - c.clientHeight < 48)
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleRaw(id: string) {
    setRawExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function toggleCmd(id: string) {
    setExpandedCmds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const ctx: EntryCallbacks = { expanded, rawExpanded, expandedCmds, toggle, toggleRaw, toggleCmd }

  const commandCount = timeline.filter((e) => e.kind === 'command_execution').length
  const failedCount = timeline.filter(
    (e) => (e.kind === 'command_execution' && e.state === 'failed') || e.level === 'error',
  ).length

  const virtualItems = rowVirtualizer.getVirtualItems()

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--gray-12)]">
          <LayersIcon className="h-4 w-4 text-[var(--accent-9)]" />
          Execution Logs
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--gray-10)]">
          <span>{timeline.length} events</span>
          <span>{commandCount} commands</span>
          {failedCount > 0 && <span className="font-medium text-red-600">{failedCount} failed</span>}
          {isConnected && (
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <span className="font-medium text-green-600">Live</span>
            </div>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-32 flex-1">
          <MagnifyingGlassIcon className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[var(--gray-9)]" />
          <input
            type="search"
            placeholder="Filter logs…"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            className="w-full rounded border border-[var(--gray-6)] bg-[var(--gray-1)] py-1 pl-6 pr-2 text-xs text-[var(--gray-12)] outline-none placeholder:text-[var(--gray-9)] focus:border-[var(--accent-8)]"
          />
        </div>
        <div className="flex items-center gap-1">
          {(Object.keys(KIND_LABELS) as FilterKind[]).map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => setFilterKind(kind)}
              className={`rounded px-2 py-1 font-mono text-[10px] font-medium transition ${
                filterKind === kind
                  ? 'bg-[var(--accent-9)] text-white'
                  : 'border border-[var(--gray-6)] text-[var(--gray-11)] hover:bg-[var(--gray-3)]'
              }`}
            >
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
        {agentOptions.length > 1 && (
          <select
            value={filterAgent}
            onChange={(e) => setFilterAgent(e.target.value)}
            className="rounded border border-[var(--gray-6)] bg-[var(--gray-1)] px-2 py-1 text-xs text-[var(--gray-12)] outline-none focus:border-[var(--accent-8)]"
          >
            <option value="">All agents</option>
            {agentOptions.map((label) => (
              <option key={label} value={label}>
                {label.replace(/^agent:/, '')}
              </option>
            ))}
          </select>
        )}
        {!isFollowingOutput && (
          <button
            type="button"
            onClick={() => {
              const c = parentRef.current
              if (c) c.scrollTop = c.scrollHeight
              setIsFollowingOutput(true)
            }}
            className="rounded-full border border-[var(--gray-6)] bg-[var(--gray-1)] px-3 py-1 text-xs font-medium text-[var(--gray-11)] shadow-sm transition hover:bg-[var(--gray-3)]"
          >
            Follow output
          </button>
        )}
      </div>

      {/* Log list */}
      {!logs || logs.length === 0 ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center">
          <div className="text-[var(--gray-9)]">
            <LayersIcon className="mx-auto mb-3 h-10 w-10 text-[var(--gray-6)]" />
            <p className="text-sm">No logs available</p>
            <p className="mt-1 text-xs text-[var(--gray-8)]">Logs will appear here once the job starts</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] dark:bg-[var(--gray-3)]">
          <div ref={parentRef} onScroll={handleScroll} className="h-full overflow-auto px-3 pt-3">
            {virtualItems.length > 0 ? (
              /* Virtual scroll path: absolutely positioned items inside a sized container */
              <Agent style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                {virtualItems.map((virtualItem) => (
                  <div
                    key={virtualItem.key}
                    data-index={virtualItem.index}
                    ref={rowVirtualizer.measureElement}
                    style={{ position: 'absolute', top: virtualItem.start, left: 0, right: 0 }}
                    className="pb-2"
                  >
                    {renderEntry(filteredEntries[virtualItem.index], ctx)}
                  </div>
                ))}
              </Agent>
            ) : (
              /* Fallback path: all items in normal flow (0-height container / test env) */
              <Agent>
                {filteredEntries.map((entry, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: stable index in non-virtual fallback
                  <div key={i} className="pb-2">
                    {renderEntry(entry, ctx)}
                  </div>
                ))}
              </Agent>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
