import {
  type CommandExecutionTimelineEvent,
  type TimelineEvent,
} from '@/components/agent-log-model'

export const COMMAND_OUTPUT_PREVIEW_LIMIT = 420
export const RAW_OUTPUT_PREVIEW_LIMIT = 300
const COMMAND_BATCH_MIN_SIZE = 2
const COMMAND_BATCH_MAX_GAP_MS = 120_000

export type DisplayEntry = { kind: 'event'; event: TimelineEvent } | CommandBatchDisplayEntry

export interface CommandBatchDisplayEntry {
  kind: 'command_batch'
  id: string
  sourceLabel: string
  createdAt: string
  completedAt: string
  events: CommandExecutionTimelineEvent[]
}

export function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function getToolState(
  event: CommandExecutionTimelineEvent,
): 'input-streaming' | 'output-available' | 'output-error' {
  if (event.state === 'running') return 'input-streaming'
  if (event.state === 'failed') return 'output-error'
  return 'output-available'
}

export function clipText(value: string, limit: number): string {
  if (value.length <= limit) return value
  return `${value.slice(0, limit)}\n...`
}

export function oneLine(value: string, limit = 150): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit)}...`
}

function timestampMs(value: string): number {
  const parsed = new Date(value).getTime()
  return Number.isNaN(parsed) ? 0 : parsed
}

export function buildDisplayEntries(timeline: TimelineEvent[]): DisplayEntry[] {
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

// Agent source → Tailwind color name
const AGENT_COLOR_MAP: Record<string, string> = {
  claudecodeagent: 'blue',
  codex: 'green',
  gemini: 'purple',
  qwen: 'amber',
  kimi: 'pink',
  mistral: 'teal',
  opencode: 'orange',
  qwencodeagent: 'amber',
  kimicodeagent: 'pink',
}

// Pre-built safe Tailwind class pairs (required for Tailwind v4 purge)
export const AGENT_COLOR_CLASSES: Record<string, { badge: string }> = {
  blue: { badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
  green: { badge: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  purple: { badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' },
  amber: { badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  pink: { badge: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400' },
  teal: { badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400' },
  orange: { badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
  red: { badge: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  gray: { badge: 'bg-[var(--gray-3)] text-[var(--gray-11)]' },
}

const HASH_COLORS = ['blue', 'green', 'purple', 'amber', 'pink', 'teal', 'orange', 'red']

function hashColor(name: string): string {
  let hash = 0
  for (const char of name) hash = ((hash * 31 + char.charCodeAt(0)) | 0)
  return HASH_COLORS[Math.abs(hash) % HASH_COLORS.length]
}

export function getAgentColor(sourceLabel: string): string {
  const name = sourceLabel.replace(/^agent:/, '').toLowerCase()
  for (const [key, color] of Object.entries(AGENT_COLOR_MAP)) {
    if (name.includes(key)) return color
  }
  if (name === 'viberator') return 'gray'
  return hashColor(name)
}

export function getEntrySourceLabel(entry: DisplayEntry): string {
  return entry.kind === 'command_batch' ? entry.sourceLabel : entry.event.sourceLabel
}

export function getUniqueAgentLabels(entries: DisplayEntry[]): string[] {
  const labels = new Set<string>()
  for (const entry of entries) labels.add(getEntrySourceLabel(entry))
  return Array.from(labels).sort()
}
