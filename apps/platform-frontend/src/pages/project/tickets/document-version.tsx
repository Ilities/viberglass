import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { usePersonName } from '@/hooks/usePeople'
import { getPhaseDocumentRevisions, type PhaseDocumentRevisionResponse } from '@/service/api/ticket-api'
import { useEffect, useState } from 'react'
import { FullScreenReader } from './full-screen-reader'
import { diffLines } from './line-diff'
import { MarkdownDocument } from './markdown/markdown-document'

const DOCUMENT_NAME = { planning: 'Plan' } as const

interface DocumentVersionProps {
  ticketId: string
  step: 'planning'
  version: number
  /** Whether it opens compared with the current version. */
  comparing?: boolean
  /** Leaves the old version for the current document. */
  onShowCurrent: () => void
}

function Comparison({ before, after }: { before: string; after: string }) {
  const lines = diffLines(before, after)
  if (lines.every((line) => line.kind === 'same')) return <p className="text-sm text-[var(--gray-10)]">This version matches the current one.</p>
  return (
    <pre className="overflow-x-auto rounded-lg border border-[var(--gray-5)] bg-[var(--gray-2)] p-4 text-xs leading-6 whitespace-pre-wrap">
      {lines.map((line, index) => (
        <div
          key={index}
          className={
            line.kind === 'added'
              ? 'bg-[var(--green-3)] text-[var(--green-11)]'
              : line.kind === 'removed'
                ? 'bg-[var(--red-3)] text-[var(--red-11)] line-through'
                : 'text-[var(--gray-11)]'
          }
        >
          <span aria-hidden className="mr-2 select-none">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '−' : ' '}</span>
          <span className="sr-only">{line.kind === 'added' ? 'Added in the current version: ' : line.kind === 'removed' ? 'Removed since: ' : ''}</span>
          {line.text || ' '}
        </div>
      ))}
    </pre>
  )
}

/**
 * One saved version of a document, read-only, so a link to an earlier version
 * never shows the current text in its place. It can be compared with the current one.
 */
export function DocumentVersion({
  ticketId,
  step,
  version,
  comparing: compareFirst = false,
  onShowCurrent,
}: DocumentVersionProps) {
  const personName = usePersonName()
  const [revisions, setRevisions] = useState<PhaseDocumentRevisionResponse[] | null>(null)
  const [comparing, setComparing] = useState(compareFirst)
  const [fullScreen, setFullScreen] = useState(false)

  useEffect(() => {
    let cancelled = false
    setRevisions(null)
    getPhaseDocumentRevisions(ticketId, step)
      .then((loaded) => !cancelled && setRevisions(loaded))
      .catch(() => !cancelled && setRevisions([]))
    return () => {
      cancelled = true
    }
  }, [ticketId, step])

  if (!revisions) return <p className="py-6 text-sm text-[var(--gray-10)]">Loading version {version}…</p>
  const shown = revisions.find((revision) => revision.version === version)
  const current = revisions.reduce<PhaseDocumentRevisionResponse | null>((latest, revision) => (!latest || revision.version > latest.version ? revision : latest), null)
  const name = DOCUMENT_NAME[step]
  if (!shown || !current) {
    return (
      <div className="space-y-3 py-6 text-sm text-[var(--gray-10)]">
        <p>
          {name} v{version} isn&apos;t available.
        </p>
        <Button outline onClick={onShowCurrent}>
          Open the current {name.toLowerCase()}
        </Button>
      </div>
    )
  }
  const isCurrent = shown.version === current.version
  const who = shown.source === 'agent' ? 'Written by the agent' : `Edited by ${personName(shown.actor) ?? 'someone'}`

  return (
    <article aria-label={`${name} v${shown.version}`} className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--gray-5)] bg-[var(--gray-2)] px-4 py-3">
        <div className="space-y-1">
          <p className="flex items-center gap-2 text-sm font-medium text-[var(--gray-12)]">
            {name} v{shown.version}
            <Badge color={isCurrent ? 'green' : 'zinc'}>{isCurrent ? 'Current' : `Older · current is v${current.version}`}</Badge>
          </p>
          <p className="text-xs text-[var(--gray-10)]">
            {who} · <Timestamp date={shown.createdAt} />
          </p>
        </div>
        <div className="flex gap-2">
          {!isCurrent && (
            <Button outline onClick={() => setComparing(!comparing)} aria-pressed={comparing}>
              {comparing ? 'Hide comparison' : 'Compare with current'}
            </Button>
          )}
          <Button outline onClick={() => setFullScreen(true)}>
            Full screen
          </Button>
          <Button outline onClick={onShowCurrent}>
            {isCurrent ? 'Comment or edit' : 'Open current'}
          </Button>
        </div>
      </header>
      {comparing ? <Comparison before={shown.content} after={current.content} /> : <MarkdownDocument source={shown.content} />}
      <FullScreenReader
        open={fullScreen}
        onClose={() => setFullScreen(false)}
        title={
          <>
            {name} v{shown.version}
            {comparing && <span className="font-normal text-[var(--gray-10)]">compared with v{current.version}</span>}
          </>
        }
        meta={
          <>
            {who} · <Timestamp date={shown.createdAt} />
          </>
        }
      >
        {comparing ? <Comparison before={shown.content} after={current.content} /> : <MarkdownDocument reading source={shown.content} />}
      </FullScreenReader>
      {!isCurrent && <p className="text-xs text-[var(--gray-10)]">Older versions are read-only. Comments and edits go on the current version.</p>}
    </article>
  )
}
