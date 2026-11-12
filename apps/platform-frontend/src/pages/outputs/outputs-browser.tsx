import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { getProjectsList } from '@/data'
import { useDebounce } from '@/hooks/useDebounce'
import { usePins } from '@/hooks/usePins'
import { getOutputs, getOutputsSummary } from '@/service/api/outputs-api'
import { OUTPUT_KINDS, type OutputItem, type OutputKind, type OutputProducer, type OutputsQuery, type OutputsSummary, type Project } from '@viberglass/types'
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import { OutputCard } from './output-card'
import { groupByDate, outputPinTarget } from './output-text'
import { OutputsFilters, OutputsToolbar, type OutputsView } from './outputs-filters'
import { OutputsList } from './outputs-list'
import { QuickLook } from './quick-look'

const VIEW_KEY = 'outputs.view'

const kindOf = (value: string | null): OutputKind | null => OUTPUT_KINDS.find((kind) => kind === value) ?? null
const producerOf = (value: string | null): OutputProducer | null => (value === 'agent' || value === 'person' ? value : null)

/**
 * What agents and people made, as covers or rows, with filters in the address
 * and quick look: across every space, or one space's when `spaceId` is given.
 */
export function OutputsBrowser({
  spaceId: fixedSpaceId,
  header,
  empty,
}: {
  spaceId?: string
  /** The page's top, given the view's own controls and the counts. */
  header: (parts: { toolbar: ReactNode; summary: OutputsSummary | null }) => ReactNode
  /** What shows before anything is made. */
  empty: ReactNode
}) {
  const [params, setParams] = useSearchParams()
  const kind = kindOf(params.get('kind'))
  const spaceId = fixedSpaceId ?? params.get('space')
  const producer = producerOf(params.get('by'))
  const q = params.get('q') ?? ''
  const latest = params.get('versions') !== 'all'

  const [searchInput, setSearchInput] = useState(q)
  const settledSearch = useDebounce(searchInput, 300)
  const [view, setView] = useState<OutputsView>(() => (localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid'))
  const [spaces, setSpaces] = useState<Project[]>([])
  const [items, setItems] = useState<OutputItem[] | null>(null)
  const [cursor, setCursor] = useState<string | null>(null)
  const [summary, setSummary] = useState<OutputsSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [reloads, setReloads] = useState(0)
  const [looking, setLooking] = useState<number | null>(null)
  const pins = usePins()
  const pinnedState = (item: OutputItem) => {
    const target = outputPinTarget(item)
    return target ? pins.isPinned(target) : null
  }
  const togglePin = (item: OutputItem) => {
    const target = outputPinTarget(item)
    if (target) void pins.toggle(target)
  }

  const query = useMemo<OutputsQuery>(
    () => ({ kind: kind ?? undefined, spaceId: spaceId ?? undefined, producer: producer ?? undefined, q: q || undefined, latest }),
    [kind, spaceId, producer, q, latest]
  )

  const setParam = useCallback(
    (name: string, value: string | null) =>
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          if (value === null) next.delete(name)
          else next.set(name, value)
          return next
        },
        { replace: name === 'q' }
      ),
    [setParams]
  )

  // The box holds what is being typed; the URL catches up once the typing settles.
  useEffect(() => {
    if (settledSearch !== searchInput || settledSearch === q) return
    setParam('q', settledSearch || null)
  }, [settledSearch, searchInput, q, setParam])

  useEffect(() => {
    if (fixedSpaceId) return
    getProjectsList()
      .then((projects) => setSpaces(projects.filter((space) => space.backingKind === 'files' || space.backingKind === 'app')))
      .catch(() => undefined)
  }, [fixedSpaceId])

  useEffect(() => {
    let cancelled = false
    setError(null)
    Promise.all([getOutputs(query), getOutputsSummary(query)])
      .then(([page, nextSummary]) => {
        if (cancelled) return
        setItems(page.items)
        setCursor(page.nextCursor)
        setSummary(nextSummary)
      })
      .catch((failure: unknown) => !cancelled && setError(failure instanceof Error ? failure.message : "Couldn't load the outputs"))
    return () => {
      cancelled = true
    }
  }, [query, reloads])

  const loadMore = async () => {
    if (!cursor) return
    setLoadingMore(true)
    try {
      const page = await getOutputs({ ...query, cursor })
      setItems((current) => [...(current ?? []), ...page.items])
      setCursor(page.nextCursor)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Couldn't load more outputs")
    } finally {
      setLoadingMore(false)
    }
  }

  const changeView = (next: OutputsView) => {
    setView(next)
    localStorage.setItem(VIEW_KEY, next)
  }

  const filtered = kind !== null || (spaceId !== null && !fixedSpaceId) || producer !== null || q !== ''
  const groups = items ? groupByDate(items, new Date()) : []

  return (
    <>
      {header({
        summary,
        toolbar: (
          <OutputsToolbar
            searchLabel={fixedSpaceId ? 'Search artifacts' : 'Search outputs'}
            search={searchInput}
            onSearch={setSearchInput}
            latest={latest}
            onLatest={(value) => setParam('versions', value ? null : 'all')}
            view={view}
            onView={changeView}
          />
        ),
      })}
      <OutputsFilters
        counts={summary?.counts ?? null}
        kind={kind}
        onKind={(value) => setParam('kind', value)}
        spaces={fixedSpaceId ? null : spaces}
        spaceId={spaceId}
        onSpace={(value) => setParam('space', value)}
        producer={producer}
        onProducer={(value) => setParam('by', value)}
      />

      {error && (
        <div className="mt-8 space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{error}</p>
          <Button outline onClick={() => setReloads((count) => count + 1)}>
            Try again
          </Button>
        </div>
      )}

      {!error && items === null && <LoadingGrid />}

      {!error && items?.length === 0 &&
        (filtered ? (
          <div className="mt-10">
            <EmptyState
              title="Nothing matches these filters"
              action={
                <Button outline onClick={() => { setSearchInput(''); setParams(new URLSearchParams()) }}>
                  Clear filters
                </Button>
              }
            />
          </div>
        ) : (
          <div className="mt-10">{empty}</div>
        ))}

      {!error && items && items.length > 0 && (
        <>
          {view === 'list' ? (
            <OutputsList items={items} />
          ) : (
            groups.map(({ group, items: groupItems }) => (
              <section key={group} aria-label={group}>
                <h2 className="mt-9 mb-4 flex items-center gap-3 font-sans text-[13px] font-semibold tracking-normal text-[var(--gray-10)] after:h-px after:flex-1 after:bg-[var(--gray-5)]">
                  {group}
                </h2>
                <div className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {groupItems.map((item) => (
                    <OutputCard
                      key={item.id}
                      item={item}
                      onQuickLook={() => setLooking(items.indexOf(item))}
                      pinned={pinnedState(item)}
                      onTogglePin={() => togglePin(item)}
                      showSpace={!fixedSpaceId}
                    />
                  ))}
                </div>
              </section>
            ))
          )}
          {cursor && (
            <div className="mt-10 flex justify-center">
              <Button outline onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? 'Loading…' : 'Show more'}
              </Button>
            </div>
          )}
        </>
      )}

      {looking !== null && items && <QuickLook items={items} index={looking} onIndexChange={setLooking} onClose={() => setLooking(null)} isPinned={pinnedState} onTogglePin={togglePin} />}
    </>
  )
}

function LoadingGrid() {
  return (
    <div aria-label="Loading outputs" className="mt-14 grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index}>
          <div className="aspect-[16/10] rounded-md bg-[var(--gray-3)]" />
          <div className="mt-3 h-4 w-2/3 rounded-sm bg-[var(--gray-3)]" />
          <div className="mt-2 h-3 w-1/2 rounded-sm bg-[var(--gray-2)]" />
        </div>
      ))}
    </div>
  )
}
