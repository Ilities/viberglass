import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import type { TaskTimelineEntry } from '@viberglass/types'
import { readableQuote } from './readable-quote'

type EventEntry = Extract<TaskTimelineEntry, { kind: 'event' }>

const STEP_OF = { research: 'research', planning: 'planning' } as const
const DOCUMENT_NOUN = { research: 'research', planning: 'plan' } as const

/** A comment the thread can show in full: one recorded with its text. Older ones only have their quote. */
export function isFullComment(entry: TaskTimelineEntry): boolean {
  return entry.kind === 'event' && entry.activity.kind === 'comment_added' && typeof entry.activity.payload.comment === 'string'
}

/** Each comment's latest open or resolved state, from the thread's status changes. */
export function commentStatuses(entries: TaskTimelineEntry[]): Map<string, 'open' | 'resolved'> {
  const statuses = new Map<string, 'open' | 'resolved'>()
  for (const entry of entries) {
    if (entry.kind !== 'event' || entry.activity.kind !== 'comment_status_changed') continue
    const { commentId, status } = entry.activity.payload
    if (typeof commentId === 'string' && (status === 'open' || status === 'resolved')) statuses.set(commentId, status)
  }
  return statuses
}

/**
 * A comment on a document, as the thread shows it: who said what, a short
 * quote of the text it's about, and whether it's still open. The quote is
 * clamped so it never pushes the feedback out of view.
 */
export function CommentEntry({
  entry,
  status,
  onOpenComments,
}: {
  entry: EventEntry
  status: 'open' | 'resolved'
  onOpenComments: (step: 'research' | 'planning') => void
}) {
  const { payload, actor } = entry.activity
  const step = payload.step === 'planning' ? STEP_OF.planning : STEP_OF.research
  const quote = typeof payload.quote === 'string' ? readableQuote(payload.quote) : null
  return (
    <li aria-label={`${actor?.name ?? 'Someone'}'s comment`} className="rounded-lg border border-[var(--gray-5)] px-4 py-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--gray-10)]">
        <span className="font-medium text-[var(--gray-11)]">{actor?.name ?? 'Someone'}</span>
        <span>commented on the {DOCUMENT_NOUN[step]}</span>· <Timestamp date={entry.at} />
        <Badge color={status === 'open' ? 'amber' : 'zinc'}>{status === 'open' ? 'Open' : 'Resolved'}</Badge>
      </div>
      <p className="mt-1.5 text-sm whitespace-pre-wrap text-[var(--gray-12)]">{String(payload.comment)}</p>
      {quote && <blockquote className="mt-1.5 line-clamp-2 border-l-2 border-[var(--gray-6)] pl-2 text-xs text-[var(--gray-10)]">{quote}</blockquote>}
      <Button plain className="mt-1 -ml-2 text-xs" onClick={() => onOpenComments(step)}>
        Open in comments
      </Button>
    </li>
  )
}
