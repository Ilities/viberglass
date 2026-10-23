import type { TaskComparisonArm } from '@viberglass/types'

export function formatDurationMs(ms: number): string {
  const seconds = Math.round(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) return `${hours}h ${minutes % 60}m`
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`
  return `${seconds}s`
}

export function formatCostUsd(usd: number): string {
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`
}

/** Where a fork stands, in a few words. */
export function armState(arm: Pick<TaskComparisonArm, 'running' | 'runs' | 'lastRunStatus' | 'pullRequestUrl'>): string {
  if (arm.running) return 'Working…'
  if (arm.runs === 0) return "Didn't start"
  if (arm.lastRunStatus === 'failed') return 'Last run failed'
  if (arm.lastRunStatus === 'cancelled') return 'Last run stopped'
  return arm.pullRequestUrl ? 'Pull request open' : 'Finished'
}

/** The facts that set one fork's runs apart from another's: model, runs, time and cost. */
export function armFacts(arm: Pick<TaskComparisonArm, 'model' | 'runs' | 'durationMs' | 'costUsd'>): string[] {
  return [
    arm.model,
    arm.runs > 0 ? `${arm.runs} ${arm.runs === 1 ? 'run' : 'runs'}` : null,
    arm.durationMs !== null ? formatDurationMs(arm.durationMs) : null,
    arm.costUsd !== null ? formatCostUsd(arm.costUsd) : null,
  ].filter((fact): fact is string => Boolean(fact))
}
