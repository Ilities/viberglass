import { Timestamp } from '@/components/timestamp'
import type { Clanker, RunnerLastRun } from '@viberglass/types'

function lastRunOutcome(lastRun: RunnerLastRun): string {
  if (lastRun.status === 'completed') return 'Succeeded'
  if (lastRun.status === 'cancelled') return 'Stopped before it finished'
  return `Failed${lastRun.failureTitle ? `: ${lastRun.failureTitle}` : ''}`
}

/** A run that finishes on its own is what shows the credential works: nothing proves it before then. */
export function LastRun({ readiness }: { readiness: Clanker['readiness'] }) {
  const lastRun = readiness?.lastRun
  if (!lastRun) return <span className="text-[var(--gray-10)]">None yet. The first task run checks the key and model.</span>
  return (
    <>
      {lastRunOutcome(lastRun)} · <Timestamp date={lastRun.at} />
    </>
  )
}
