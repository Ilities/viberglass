import type { TaskTimelineEntry } from '@viberglass/types'
import type { SummaryEntryData } from './summary-entry'

export interface SummaryFacts {
  latest: SummaryEntryData | null
  /** Which summary each summarising turn wrote, matched in order. */
  versionByTurn: Map<string, number>
  /** How much the thread has grown since the latest summary, or since it began. */
  sinceLatest: { finishedTurns: number; messages: number }
}

/** The thread's summaries, and what has happened since the latest one. */
export function summaryFacts(entries: TaskTimelineEntry[]): SummaryFacts {
  const summaries = entries.filter((entry): entry is SummaryEntryData => entry.kind === 'summary')
  const latest = summaries.at(-1) ?? null
  const writers = entries.filter(
    (entry) => entry.kind === 'agent_turn' && entry.outcome?.produced.includes('summary')
  )
  const versionByTurn = new Map(writers.flatMap((turn, index) => (summaries[index] ? [[turn.id, summaries[index].version]] : [])))

  const after = latest ? entries.slice(entries.indexOf(latest) + 1) : entries
  return {
    latest,
    versionByTurn,
    sinceLatest: {
      finishedTurns: after.filter((entry) => entry.kind === 'agent_turn' && (entry.status === 'completed' || entry.status === 'failed')).length,
      messages: after.filter((entry) => entry.kind === 'message').length,
    },
  }
}
