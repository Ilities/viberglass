import { Badge } from '@/components/badge'
import type { PhaseDocumentRevisionResponse } from '@/service/api/ticket-api'
import { ChevronDownIcon } from '@radix-ui/react-icons'
import { useState } from 'react'
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
  const [isOpen, setIsOpen] = useState(false)
  const selectedRevision = revisions.find((revision) => revision.id === selectedRevisionId) ?? null

  return (
    <div className="mt-6 border-t border-[var(--gray-4)] pt-4">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 py-1 text-left"
      >
        <span className="text-sm font-medium text-[var(--gray-11)]">Revision history</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--gray-8)]">
            {revisions.length} {revisions.length === 1 ? 'snapshot' : 'snapshots'}
          </span>
          <ChevronDownIcon
            className={`h-4 w-4 text-[var(--gray-8)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {isOpen && (
        <div className="mt-4">
          {revisions.length === 0 ? (
            <p className="text-sm text-[var(--gray-9)]">No saved revisions yet.</p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
              <div className="space-y-1.5">
                {revisions.map((revision) => {
                  const isSelected = revision.id === selectedRevisionId

                  return (
                    <button
                      key={revision.id}
                      type="button"
                      onClick={() => onSelectRevision(revision.id)}
                      className={`w-full rounded-lg border px-3 py-2.5 text-left transition ${
                        isSelected
                          ? 'border-[var(--accent-8)] bg-[var(--accent-3)]'
                          : 'border-[var(--gray-5)] bg-[var(--gray-2)] hover:border-[var(--gray-6)]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Badge color={revision.source === 'agent' ? 'violet' : 'blue'}>
                          {revision.source === 'agent' ? 'Agent' : 'Manual'}
                        </Badge>
                        <span className="text-[10px] text-[var(--gray-9)]">
                          {new Date(revision.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1.5 text-xs text-[var(--gray-10)]">{formatRevisionSource(revision)}</p>
                    </button>
                  )
                })}
              </div>

              <div className="rounded-lg border border-[var(--gray-5)] bg-[var(--gray-2)] p-4">
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
                    <p className="mt-1.5 text-xs text-[var(--gray-9)]">{formatRevisionSource(selectedRevision)}</p>
                    <div className="mt-4 whitespace-pre-wrap rounded-lg border border-[var(--gray-5)] bg-[var(--gray-1)] p-4 font-mono text-sm text-[var(--gray-11)]">
                      {selectedRevision.content}
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[160px] items-center justify-center text-center text-sm text-[var(--gray-9)]">
                    Select a revision to inspect an earlier snapshot.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
