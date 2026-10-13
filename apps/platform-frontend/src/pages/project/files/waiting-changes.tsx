import { Button } from '@/components/button'
import { Timestamp } from '@/components/timestamp'
import { usePersonName } from '@/hooks/usePeople'
import type { SpaceFileChangeSummary } from '@viberglass/types'

const what = (change: SpaceFileChangeSummary) => (change.kind === 'remove' ? `Delete ${change.path}` : `Save ${change.path}`)

/**
 * Changes people made while a run held the space: waiting ones are saved once
 * it has; a failed one keeps its content to download until it's dismissed.
 */
export function WaitingChanges({
  changes,
  canChange,
  onDownload,
  onDismiss,
}: {
  changes: SpaceFileChangeSummary[]
  canChange: boolean
  onDownload: (change: SpaceFileChangeSummary) => void
  onDismiss: (change: SpaceFileChangeSummary) => void
}) {
  const personName = usePersonName()
  if (changes.length === 0) return null
  return (
    <section aria-label="Waiting changes" className="mb-6 rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)]">
      <h2 className="border-b border-[var(--gray-5)] px-4 py-3 text-sm font-semibold text-[var(--gray-12)]">Changes waiting for a run</h2>
      <ul className="divide-y divide-[var(--gray-4)]">
        {changes.map((change) => (
          <li key={change.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-[var(--gray-12)]">{what(change)}</p>
              <p className={change.status === 'failed' ? 'text-amber-800 dark:text-amber-300' : 'text-[var(--gray-10)]'}>
                {change.status === 'failed'
                  ? `Not saved: ${change.error ?? 'the run changed this file first.'}`
                  : 'Saved once the run has saved the files'}
                {' · '}
                {(change.createdBy && personName(change.createdBy)) ?? 'Someone'}, <Timestamp date={change.createdAt} />
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {change.status === 'failed' && change.hasContent && (
                <Button outline size="small" onClick={() => onDownload(change)}>
                  Download your version
                </Button>
              )}
              {canChange && (
                <Button outline size="small" onClick={() => onDismiss(change)}>
                  {change.status === 'failed' ? 'Dismiss' : 'Cancel change'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
