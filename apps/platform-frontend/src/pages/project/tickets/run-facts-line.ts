import type { RunRecord } from '@viberglass/types'
import { formatRunCost } from '../../settings/run-records/run-record-format'

function tokens(count: number): string {
  return count.toLocaleString('en-US')
}

/** "4m 38s", "12s": how long the run took. */
function duration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

/**
 * "glm-4.7-flash · 4m 38s · 2,410 input tokens · 310 output tokens · $0.02":
 * what a turn's run used, in the order people look for it. A cost the run
 * didn't measure says so rather than showing nothing.
 */
export function runFactsLine(record: RunRecord): string[] {
  const usage = record.usageAvailable ? record.usage : null
  const cost = formatRunCost(record)
  return [
    record.modelSnapshot,
    record.durationMs !== null ? duration(record.durationMs) : null,
    usage?.inputTokens != null ? `${tokens(usage.inputTokens)} input tokens` : null,
    usage?.outputTokens != null ? `${tokens(usage.outputTokens)} output tokens` : null,
    usage?.cacheReadInputTokens ? `${tokens(usage.cacheReadInputTokens)} cached` : null,
    cost.amount ? `${cost.amount}${cost.provenance === 'estimate' ? ' (estimate)' : ''}` : 'cost not reported',
  ].filter((fact): fact is string => Boolean(fact))
}
