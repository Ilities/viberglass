import { SearchInput } from '@/components/search-input'
import { Select } from '@/components/select'
import { Switch } from '@/components/switch'
import { DashboardIcon, ListBulletIcon } from '@radix-ui/react-icons'
import { OUTPUT_KINDS, type OutputKind, type OutputProducer, type OutputsSummary, type Project } from '@viberglass/types'
import clsx from 'clsx'
import { KIND_LABEL } from './output-text'

export type OutputsView = 'grid' | 'list'

const ALL = 'all'

export function OutputsToolbar({
  search,
  onSearch,
  latest,
  onLatest,
  view,
  onView,
  searchLabel,
}: {
  searchLabel: string
  search: string
  onSearch: (value: string) => void
  latest: boolean
  onLatest: (value: boolean) => void
  view: OutputsView
  onView: (view: OutputsView) => void
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm font-medium text-[var(--gray-12)]">
        <Switch checked={latest} onChange={onLatest} />
        Latest versions only
      </label>
      <div role="group" aria-label="Show as" className="flex h-9 rounded-[3px] border border-[var(--gray-6)] p-0.5">
        {(['grid', 'list'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={view === option}
            onClick={() => onView(option)}
            className={clsx(
              'flex items-center gap-1.5 rounded-[2px] px-2.5 text-sm font-medium',
              view === option ? 'bg-[var(--gray-12)] text-[var(--gray-1)]' : 'text-[var(--gray-11)] hover:text-[var(--gray-12)]'
            )}
          >
            {option === 'grid' ? <DashboardIcon /> : <ListBulletIcon />}
            {option === 'grid' ? 'Grid' : 'List'}
          </button>
        ))}
      </div>
      <div className="w-64">
        <SearchInput placeholder={searchLabel} aria-label={searchLabel} value={search} onChange={(event) => onSearch(event.target.value)} />
      </div>
    </div>
  )
}

export function OutputsFilters({
  counts,
  kind,
  onKind,
  spaces,
  spaceId,
  onSpace,
  producer,
  onProducer,
}: {
  counts: OutputsSummary['counts'] | null
  kind: OutputKind | null
  onKind: (kind: OutputKind | null) => void
  /** Null when the view is one space's, so there's nothing to choose. */
  spaces: Project[] | null
  spaceId: string | null
  onSpace: (spaceId: string | null) => void
  producer: OutputProducer | null
  onProducer: (producer: OutputProducer | null) => void
}) {
  // A kind with nothing in it adds noise, unless it's the one picked.
  const kinds = OUTPUT_KINDS.filter((option) => option === kind || (counts?.[option] ?? 0) > 0)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Kind" className="flex flex-wrap gap-1.5">
        <KindChip label="All" count={counts?.all} pressed={kind === null} onClick={() => onKind(null)} />
        {kinds.map((option) => (
          <KindChip key={option} label={KIND_LABEL[option]} count={counts?.[option]} pressed={kind === option} onClick={() => onKind(option)} />
        ))}
      </div>
      <div className="ml-auto flex gap-2">
        {spaces && (
          <Select aria-label="Space" value={spaceId ?? ALL} onChange={(value) => onSpace(value === ALL ? null : value)} className="w-44">
            <option value={ALL}>All spaces</option>
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </Select>
        )}
        <Select aria-label="Made by" value={producer ?? ALL} onChange={(value) => onProducer(value === 'agent' || value === 'person' ? value : null)} className="w-40">
          <option value={ALL}>Anyone</option>
          <option value="agent">Agents</option>
          <option value="person">People</option>
        </Select>
      </div>
    </div>
  )
}

function KindChip({ label, count, pressed, onClick }: { label: string; count: number | undefined; pressed: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={clsx(
        'flex h-9 items-center gap-2 rounded-[3px] border px-3 text-sm font-medium transition-colors',
        pressed
          ? 'border-[var(--gray-12)] bg-[var(--gray-12)] text-[var(--gray-1)]'
          : 'border-[var(--gray-5)] bg-[var(--color-panel-solid)] text-[var(--gray-12)] hover:bg-[var(--gray-2)]'
      )}
    >
      {label}
      {count !== undefined && <span className={clsx('font-mono text-xs tabular-nums', pressed ? 'text-[var(--gray-8)]' : 'text-[var(--gray-10)]')}>{count}</span>}
    </button>
  )
}
