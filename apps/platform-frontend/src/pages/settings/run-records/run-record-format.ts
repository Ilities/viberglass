import type { RunRecord } from '@viberglass/types'

type BadgeColor = 'green' | 'red' | 'amber' | 'zinc' | 'blue'

/** The run's Record view: task runs open on their task, schedule runs on their own page. */
export function runRecordHref(record: RunRecord): string | null {
  if (!record.projectSlug) return null
  return record.ticketId
    ? `/spaces/${record.projectSlug}/tasks/${record.ticketId}?run=${record.jobId}&runTab=record`
    : `/spaces/${record.projectSlug}/runs/${record.jobId}?runTab=record`
}

/** The agent by its Viberglass name; the harness id when the agent is gone. */
export function formatAgentName(record: RunRecord): string | null {
  return record.clankerName ?? record.agent ?? record.requestedAgent
}

/** The harness and, when the CLI reported it, its version: "opencode 1.18.25". */
export function formatHarness(record: RunRecord): string | null {
  const harness = record.agent ?? record.requestedAgent
  if (!harness) return null
  return record.harnessVersion ? `${harness} ${record.harnessVersion}` : harness
}

export function formatRunResult(record: RunRecord): { label: string; color: BadgeColor } {
  if (record.success === true) return { label: 'Succeeded', color: 'green' }
  if (record.success === false) return { label: 'Failed', color: 'red' }
  return { label: 'No result', color: 'zinc' }
}

/** The PR's outcome; "Not checked" until the outcome sweeper has read it. */
export function formatPullRequestState(record: RunRecord): { label: string; color: BadgeColor } | null {
  const pullRequest = record.pullRequest
  if (!pullRequest) return null
  switch (pullRequest.state) {
    case 'merged':
      return { label: 'Merged', color: 'green' }
    case 'closed':
      return { label: 'Closed', color: 'red' }
    case 'open':
      return { label: 'Open', color: 'blue' }
    default:
      return { label: pullRequest.lastError ? 'Check failed' : 'Not checked', color: 'amber' }
  }
}

/** Cost with where it came from, so an estimate never reads as a measurement. */
export function formatRunCost(record: RunRecord): { amount: string | null; provenance: string } {
  const amount = record.costUsd === null ? null : formatUsd(record.costUsd)
  switch (record.costProvenance) {
    case 'actual':
      return { amount, provenance: 'measured' }
    case 'estimated':
      return { amount, provenance: 'estimate' }
    default:
      return { amount: null, provenance: 'not measured' }
  }
}

function formatUsd(value: number): string {
  if (value === 0) return '$0'
  return value < 0.01 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`
}

/** "7,748 in · 14 out", or null when the CLI reported no usage. */
export function formatTokenSummary(record: RunRecord): string | null {
  const usage = record.usage
  if (!record.usageAvailable || !usage) return null
  const parts = [
    usage.inputTokens !== null ? `${usage.inputTokens.toLocaleString('en-US')} in` : null,
    usage.outputTokens !== null ? `${usage.outputTokens.toLocaleString('en-US')} out` : null,
  ].filter((part) => part !== null)
  return parts.length > 0 ? parts.join(' · ') : null
}
