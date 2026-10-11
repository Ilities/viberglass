import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { usePersonName } from '@/hooks/usePeople'
import { getPlanRevisions, type PhaseDocumentRevisionResponse } from '@/service/api/ticket-api'
import { useEffect, useMemo, useState } from 'react'
import { FullScreenReader } from './full-screen-reader'
import { compareDocuments } from './document-comparison'
import { MarkdownDocument } from './markdown/markdown-document'

interface DocumentVersionProps {
  ticketId: string
  version: number
  /** Whether it opens compared with the current version. */
  comparing?: boolean
  /** Leaves the old version for the current document. */
  onShowCurrent: () => void
}

function Comparison({ before, after, reading = false }: { before: string; after: string; reading?: boolean }) {
  const comparison = useMemo(() => compareDocuments(before, after), [before, after])
  if (!comparison.changed) return <p className="text-sm text-[var(--gray-10)]">This version matches the current one.</p>
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap gap-x-4 text-xs text-[var(--gray-10)]">
        <span>
          <del className="rounded-[2px] bg-[var(--red-a3)] text-[var(--red-11)]">Struck through</del>: only in this version
        </span>
        <span>
          <ins className="rounded-[2px] bg-[var(--green-a4)] text-[var(--green-12)] no-underline">Highlighted</ins>: added in the current version
        </span>
      </p>
      <MarkdownDocument source={comparison.source} highlights={comparison.highlights} reading={reading} />
    </div>
  )
}

/**
 * One saved version of a document, read-only, so a link to an earlier version
 * never shows the current text in its place. It can be compared with the current one.
 */
export function DocumentVersion({
  ticketId,
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
    getPlanRevisions(ticketId)
      .then((loaded) => !cancelled && setRevisions(loaded))
      .catch(() => !cancelled && setRevisions([]))
    return () => {
      cancelled = true
    }
  }, [ticketId])

  if (!revisions) return <p className="py-6 text-sm text-[var(--gray-10)]">Loading version {version}…</p>
  const shown = revisions.find((revision) => revision.version === version)
  const current = revisions.reduce<PhaseDocumentRevisionResponse | null>((latest, revision) => (!latest || revision.version > latest.version ? revision : latest), null)
  const name = 'Plan'
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
        {comparing ? <Comparison reading before={shown.content} after={current.content} /> : <MarkdownDocument reading source={shown.content} />}
      </FullScreenReader>
      {!isCurrent && <p className="text-xs text-[var(--gray-10)]">Older versions are read-only. Comments and edits go on the current version.</p>}
    </article>
  )
}
