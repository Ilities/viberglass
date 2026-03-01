import { Badge } from '@/components/badge'
import { Subheading } from '@/components/heading'
import type { PhaseDocumentRevisionResponse } from '@/service/api/ticket-api'
import { formatRevisionSource } from './phase-document-ui'

interface PhaseDocumentRevisionHistoryProps {
  revisions: PhaseDocumentRevisionResponse[]
  selectedRevisionId: string | null
  onSelectRevision: (revisionId: string) => void
}

export function PhaseDocumentRevisionHistory({
  revisions,
  selectedRevisionId,
  onSelectRevision,
}: PhaseDocumentRevisionHistoryProps) {
  const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? null

  return (
    <div className="rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4">
      <div className="flex items-center justify-between gap-3">
        <Subheading>Revision History</Subheading>
        <span className="text-xs text-[var(--gray-9)]">
          {revisions.length} {revisions.length === 1 ? 'snapshot' : 'snapshots'}
        </span>
      </div>

      {revisions.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--gray-9)]">No saved revisions yet.</p>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
          <div className="space-y-2">
            {revisions.map((revision) => {
              const isSelected = revision.id === selectedRevisionId

              return (
                <button
                  key={revision.id}
                  type="button"
                  onClick={() => onSelectRevision(revision.id)}
                  className={`w-full rounded-lg border p-3 text-left transition ${
                    isSelected
                      ? 'border-[var(--accent-8)] bg-[var(--accent-3)]'
                      : 'border-[var(--gray-6)] bg-[var(--gray-2)] hover:border-[var(--gray-7)]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge color={revision.source === 'agent' ? 'violet' : 'blue'}>
                      {revision.source === 'agent' ? 'Agent' : 'Manual'}
                    </Badge>
                    <span className="text-xs text-[var(--gray-9)]">
                      {new Date(revision.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-[var(--gray-10)]">{formatRevisionSource(revision)}</p>
                </button>
              )
            })}
          </div>

          <div className="rounded-lg border border-[var(--gray-6)] bg-[var(--gray-2)] p-4">
            {selectedRevision ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge color={selectedRevision.source === 'agent' ? 'violet' : 'blue'}>
                    {selectedRevision.source === 'agent' ? 'Agent' : 'Manual'}
                  </Badge>
                  <span className="text-xs text-[var(--gray-9)]">
                    {new Date(selectedRevision.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="mt-2 text-xs text-[var(--gray-9)]">{formatRevisionSource(selectedRevision)}</p>
                <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[var(--gray-6)] bg-[var(--gray-1)] p-4 font-mono text-sm text-[var(--gray-11)]">
                  {selectedRevision.content}
                </div>
              </>
            ) : (
              <div className="flex min-h-[180px] items-center justify-center text-center text-sm text-[var(--gray-9)]">
                Select a revision to inspect an earlier snapshot.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
