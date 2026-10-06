import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { usePersonName } from '@/hooks/usePeople'
import { getPhaseDocumentRevisions, type PhaseDocumentRevisionResponse } from '@/service/api/ticket-api'
import { useEffect, useState } from 'react'

export const DOCUMENT_NAME = { planning: 'Plan' } as const

/** The document's newest version, read again whenever the document changes; nothing while there's no document. */
export function useLatestRevision(
  ticketId: string,
  step: 'planning',
  updatedAt: string,
  enabled: boolean
): PhaseDocumentRevisionResponse | null {
  const [latest, setLatest] = useState<PhaseDocumentRevisionResponse | null>(null)
  useEffect(() => {
    if (!enabled) return
    let cancelled = false
    getPhaseDocumentRevisions(ticketId, step)
      .then((revisions) => {
        if (cancelled) return
        setLatest(revisions.reduce<PhaseDocumentRevisionResponse | null>((newest, revision) => (!newest || revision.version > newest.version ? revision : newest), null))
      })
      .catch(() => !cancelled && setLatest(null))
    return () => {
      cancelled = true
    }
  }, [ticketId, step, updatedAt, enabled])
  return latest
}

/** "Written by the agent · 2d ago": who wrote the version shown, and when. */
export function VersionByline({ revision, updatedAt }: { revision: PhaseDocumentRevisionResponse | null; updatedAt: string }) {
  const personName = usePersonName()
  const who = revision ? (revision.source === 'agent' ? 'Written by the agent' : `Edited by ${personName(revision.actor) ?? 'someone'}`) : 'Last changed'
  return (
    <>
      {who} · <Timestamp date={revision?.createdAt ?? updatedAt} />
    </>
  )
}

/** "Plan v3": the document's name and the version shown. */
export function VersionTitle({ step, version }: { step: 'planning'; version: number | null }) {
  return (
    <>
      {DOCUMENT_NAME[step]}
      {version !== null && <Badge>v{version}</Badge>}
    </>
  )
}

/** The document's name and version, who wrote this version and when, and comparing, reading full screen or editing it. */
export function DocumentHead({
  step,
  latest,
  updatedAt,
  onCompare,
  onFullScreen,
  onEdit,
}: {
  step: 'planning'
  latest: PhaseDocumentRevisionResponse | null
  updatedAt: string
  onCompare: (version: number) => void
  onFullScreen: () => void
  onEdit?: () => void
}) {
  return (
    <div className="-mx-6 -mt-5 mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--gray-5)] px-6 py-4 max-sm:-mx-4 max-sm:px-4">
      <div>
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--gray-12)]">
          <VersionTitle step={step} version={latest?.version ?? null} />
        </p>
        <p className="mt-0.5 text-xs text-[var(--gray-10)]">
          <VersionByline revision={latest} updatedAt={updatedAt} />
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {latest && latest.version > 1 && (
          <Button outline onClick={() => onCompare(latest.version - 1)}>
            Compare versions
          </Button>
        )}
        <Button outline onClick={onFullScreen}>
          Full screen
        </Button>
        {onEdit && (
          <Button outline onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
    </div>
  )
}
