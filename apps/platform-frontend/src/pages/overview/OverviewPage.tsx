import { FunLoading } from '@/components/fun-loading'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { Link } from '@/components/link'
import { Select } from '@/components/select'
import { getOverview } from '@/service/api/home-api'
import { useApiRefresh } from '@/hooks/useApiRefresh'
import type { OverviewData, OverviewGroup } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { DashboardMetrics } from './dashboard-metrics'
import { CollapsedOverviewSection } from './collapsed-overview-section'
import { OverviewOutcomes } from './overview-outcomes'
import { OverviewSection } from './overview-section'

const POLL_MS = 30_000
/** The space picker's choice for every space; Radix's select keeps the empty value for no choice at all. */
const ALL_SPACES = 'all'

/** In the order a reader acts on them; a task is in only one, so nothing is counted twice. */
const LISTS: Array<{
  key: Exclude<OverviewGroup, 'doneThisWeek'>
  title: string
  empty: string
  badged?: boolean
}> = [
  {
    key: 'needsAttention',
    title: 'Needs attention',
    empty: 'Nothing is failed or asking a question.',
    badged: true,
  },
  {
    key: 'liveNow',
    title: 'Agent working',
    empty: 'No agent is working right now.',
  },
  {
    key: 'waiting',
    title: 'Waiting on people',
    empty: 'Nothing is waiting on anyone.',
  },
  {
    key: 'notStarted',
    title: 'Not started',
    empty: 'Every task has been started.',
  },
]

/** Overview: how the work is going across the workspace, and what's stuck. Read-only. */
export function OverviewPage() {
  const [space, setSpace] = useState<string | undefined>(undefined)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [spaces, setSpaces] = useState<OverviewData['spaces']>([])
  const [failed, setFailed] = useState(false)
  const revision = useApiRefresh('/api/spaces', '/api/tasks', '/api/jobs', '/api/setup/demo')

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getOverview(space)
        .then((data) => {
          if (cancelled) return
          setOverview(data)
          setFailed(false)
          // The filter lists every space with work, so keep the unfiltered list.
          if (!space) setSpaces(data.spaces)
        })
        .catch(() => !cancelled && setFailed(true))
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [space, revision])

  if (!overview && !failed) return <FunLoading retro />

  return (
    <>
      <PageMeta title="Overview" />
      <PageHeader
        title="Work across your spaces"
        description="Progress, blockers, and completed outcomes."
        actions={
          spaces.length > 1 && (
            <div className="w-48">
              <Select
                aria-label="Overview space"
                value={space ?? ALL_SPACES}
                onChange={(value) => setSpace(value === ALL_SPACES ? undefined : value)}
              >
                <option value={ALL_SPACES}>All spaces</option>
                {spaces.map((entry) => (
                  <option key={entry.slug} value={entry.slug}>
                    {entry.name}
                  </option>
                ))}
              </Select>
            </div>
          )
        }
      />
      {failed && !overview && (
        <p className="text-sm text-red-600">The overview couldn&apos;t be loaded. Try again in a moment.</p>
      )}
      {overview && (
        <>
          <DashboardMetrics overview={overview} />
          <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
            <div>
              <OverviewSection id="overview-needsAttention" title="Needs attention" empty="Nothing is failed or asking a question." badged tasks={overview.needsAttention} />
              {!space && spaces.length > 0 && (
                <section aria-labelledby="overview-spaces" className="mb-8">
                  <h2 id="overview-spaces" className="mb-3 text-base font-semibold">Spaces with work</h2>
                  <div className="divide-y divide-[var(--gray-5)] border-y border-[var(--gray-5)]">
                    {spaces.map((entry) => (
                      <Link key={entry.slug} href={`/spaces/${entry.slug}`} className="flex flex-wrap items-center justify-between gap-3 py-4 hover:bg-[var(--gray-2)]">
                        <span className="font-medium">{entry.name}</span>
                        <span className="text-xs text-[var(--gray-10)]">{entry.liveNow} working · {entry.waiting} waiting · {entry.needsAttention} need attention</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {LISTS.filter(({ key }) => key !== 'needsAttention').map(({ key: group, title, empty }) => (
                <CollapsedOverviewSection key={group} id={`overview-${group}`} title={title} empty={empty} tasks={overview[group]} />
              ))}
            </div>
            <OverviewOutcomes tasks={overview.doneThisWeek} />
          </div>
        </>
      )}
    </>
  )
}
