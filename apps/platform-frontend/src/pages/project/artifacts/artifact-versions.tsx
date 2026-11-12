import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { artifactPath, formatBytes } from '@/lib/artifacts'
import type { ArtifactVersionSummary } from '@viberglass/types'
import clsx from 'clsx'

/** Who made a version: the agent on a run, or the person whose edit did. */
export function versionMaker(version: ArtifactVersionSummary, personName: (id: string | null) => string | null): string {
  return version.producedBy.kind === 'run' ? 'By the agent' : `Edited by ${personName(version.producedBy.userId) ?? 'someone'}`
}

/** Every version of an artifact, newest first; picking one shows it. */
export function ArtifactVersions({
  spaceSlug,
  artifactId,
  versions,
  selectedId,
  currentId,
  personName,
}: {
  spaceSlug: string
  artifactId: string
  versions: ArtifactVersionSummary[]
  selectedId: string | null
  currentId: string | null
  personName: (id: string | null) => string | null
}) {
  return (
    <nav aria-label="Versions">
      <h2 className="mb-2 flex items-baseline justify-between font-sans text-sm font-semibold tracking-normal text-[var(--gray-12)]">
        Versions
        <span className="text-xs font-normal text-[var(--gray-10)]">
          {versions.filter((version) => version.status === 'available').length} kept of {versions.length}
        </span>
      </h2>
      <ol className="divide-y divide-[var(--gray-4)] border-y border-[var(--gray-4)]">
        {versions.map((version) => {
          const selected = version.id === selectedId
          const expired = version.status === 'expired'
          return (
            <li key={version.id}>
              <Link
                href={artifactPath(spaceSlug, artifactId, version.id)}
                replace
                aria-current={selected ? 'page' : undefined}
                className={clsx(
                  'grid grid-cols-[2.5rem_1fr] gap-x-2 rounded-[3px] px-2 py-2.5 text-sm',
                  selected ? 'bg-[var(--gray-3)]' : 'hover:bg-[var(--gray-2)]',
                  expired && 'text-[var(--gray-9)]'
                )}
              >
                <span className={clsx('font-mono text-xs leading-5', expired ? 'text-[var(--gray-9)]' : 'text-[var(--gray-12)]')}>v{version.number}</span>
                <span className="min-w-0">
                  <span className="flex items-center gap-2 leading-5">
                    <span className="truncate">{versionMaker(version, personName)}</span>
                    {version.id === currentId && (
                      <span className="rounded-[2px] bg-[var(--accent-3)] px-1.5 text-[11px] leading-[18px] font-medium text-[var(--accent-11)]">Current</span>
                    )}
                  </span>
                  <span className="block text-xs leading-4 text-[var(--gray-10)]">
                    <Timestamp date={version.createdAt} />
                    {' · '}
                    {expired ? 'No longer kept' : formatBytes(version.totalBytes)}
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
