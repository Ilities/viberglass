import { Timestamp } from '@/components/timestamp'
import type { TaskTimelineEntry } from '@viberglass/types'
import { useState } from 'react'
import { MarkdownDocument } from './markdown/markdown-document'

export type SummaryEntryData = Extract<TaskTimelineEntry, { kind: 'summary' }>

/** Lines of a summary shown before "Show more". */
const PREVIEW_LINES = 6

function SummaryBody({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false)
  const lines = content.split('\n')
  const long = lines.length > PREVIEW_LINES
  return (
    <>
      <div className="text-sm text-[var(--gray-12)]">
        <MarkdownDocument source={expanded || !long ? content : lines.slice(0, PREVIEW_LINES).join('\n')} />
      </div>
      {long && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="text-xs text-[var(--gray-10)] hover:text-[var(--gray-12)]">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </>
  )
}

/** A summary of the conversation in the thread: the decisions, who agreed to them, the open questions. */
export function SummaryEntry({ entry }: { entry: SummaryEntryData }) {
  return (
    <li aria-label={`Summary v${entry.version}`} className="space-y-1 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-4 py-3">
      <p className="text-sm font-medium text-[var(--gray-12)]">Summary v{entry.version}</p>
      <p className="text-xs text-[var(--gray-10)]">
        Written by the agent · <Timestamp date={entry.at} />
      </p>
      <SummaryBody content={entry.content} />
    </li>
  )
}

/** The latest summary, kept at the top of the thread: what the agent now believes was agreed, for people to correct. */
export function PinnedSummary({ entry }: { entry: SummaryEntryData }) {
  const [open, setOpen] = useState(true)
  return (
    <section aria-label="Summary so far" className="space-y-1 rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] px-4 py-3">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-sm font-semibold text-[var(--gray-12)]">Summary so far</h3>
        <button type="button" onClick={() => setOpen(!open)} className="text-xs text-[var(--gray-10)] hover:text-[var(--gray-12)]" aria-expanded={open}>
          {open ? 'Hide' : 'Show'}
        </button>
      </div>
      <p className="text-xs text-[var(--gray-10)]">
        v{entry.version} · <Timestamp date={entry.at} /> · say in the thread if something's wrong
      </p>
      {open && <SummaryBody content={entry.content} />}
    </section>
  )
}
