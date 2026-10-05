import { FunLoading } from '@/components/fun-loading'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { Select } from '@/components/select'
import { getOverview } from '@/service/api/home-api'
import type { OverviewData, OverviewGroup } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { overviewMetrics } from './overview-metrics'
import { OverviewOutcomes } from './overview-outcomes'
import { OverviewSection } from './overview-section'

const POLL_MS = 30_000
/** The space picker's choice for every space; Radix's select keeps the empty value for no choice at all. */
const ALL_SPACES = 'all'

/** In the order a reader acts on them; a task is in only one, so nothing is counted twice. */
const LISTS: Array<{
  key: Exclude<OverviewGroup, 'doneThisWeek'>
  title: string
  hint: string
  empty: string
  action: string
  badged?: boolean
}> = [
  {
    key: 'needsAttention',
    title: 'Needs attention',
    hint: 'Each task has a named next move',
    empty: 'Nothing is failed, paused, asking, or waiting long.',
    action: 'Open thread',
    badged: true,
  },
  {
    key: 'liveNow',
    title: 'Live now',
    hint: 'Not counted twice in the lists below',
    empty: 'No agent is working right now.',
    action: 'Follow',
  },
  {
    key: 'waiting',
    title: 'Waiting on people',
    hint: 'Someone’s move, for less than a day',
    empty: 'Nothing is waiting on anyone.',
    action: 'Open',
  },
  {
    key: 'notStarted',
    title: 'Not started',
    hint: 'Nothing asked for yet',
    empty: 'Every task has been started.',
    action: 'Open',
  },
]

/** Overview: how the work is going across the workspace, and what's stuck. Read-only. */
export function OverviewPage() {
  const [space, setSpace] = useState<string | undefined>(undefined)
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [spaces, setSpaces] = useState<OverviewData['spaces']>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      getOverview(space)
        .then((data) => {
          if (cancelled) return
          setOverview(data)
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
  }, [space])

  if (!overview && !failed) return <FunLoading retro />

  return (
    <>
      <PageMeta title="Overview" />
      <PageHeader
        eyebrow="Workspace overview · visible spaces only"
        title="Work across the workspace"
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
          <dl aria-label="Totals" className="mb-6 grid grid-cols-3 gap-4 max-sm:gap-1.5">
            {overviewMetrics(overview).map((metric) => (
              <div
                key={metric.title}
                className="rounded-lg border border-[var(--gray-5)] bg-[var(--color-panel-solid)] p-5 max-sm:p-3"
              >
                <dt className="text-xs text-[var(--gray-10)]">{metric.title}</dt>
                <dd className="my-1 text-[29px] font-semibold text-[var(--gray-12)] max-sm:text-2xl">{metric.value}</dd>
                <dd className="text-xs text-[var(--gray-10)]">{metric.detail}</dd>
              </div>
            ))}
          </dl>
          {LISTS.map(({ key: group, ...list }) => (
            <OverviewSection key={group} id={`overview-${group}`} {...list} tasks={overview[group]} />
          ))}
          <OverviewOutcomes tasks={overview.doneThisWeek} />
        </>
      )}
    </>
  )
}
