import { FunLoading } from '@/components/fun-loading'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { TabButton } from '@/components/tab-button'
import { getOverview } from '@/service/api/home-api'
import type { OverviewData } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { OverviewSection } from './overview-section'

const POLL_MS = 30_000

/** Overview (IA §3.2): how the work is going across the workspace, and what's stuck. Read-only. */
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
      <Heading>Overview</Heading>
      {failed && !overview && <p className="mt-6 text-sm text-red-600">The overview couldn&apos;t be loaded. Try again in a moment.</p>}
      {overview && (
        <>
          {spaces.length > 1 && (
            <div role="group" aria-label="Space" className="mt-4 flex flex-wrap border-b border-[var(--gray-a5)]">
              <TabButton active={!space} onClick={() => setSpace(undefined)}>
                All spaces
              </TabButton>
              {spaces.map((entry) => (
                <TabButton key={entry.slug} active={space === entry.slug} onClick={() => setSpace(entry.slug)}>
                  {entry.name}
                </TabButton>
              ))}
            </div>
          )}
          <ul aria-label="Spaces" className="mt-4 space-y-1 text-sm text-[var(--gray-11)]">
            {overview.spaces.map((entry) => (
              <li key={entry.slug}>
                <span className="font-medium">{entry.name}</span>: {entry.inProgress} in progress · {entry.stuck} stuck ·{' '}
                {entry.doneThisWeek} done this week
              </li>
            ))}
          </ul>
          <OverviewSection title="Stuck" tasks={overview.stuck} empty="Nothing is stuck." />
          <OverviewSection title="Live now" tasks={overview.liveNow} empty="No agent is working right now." />
          <OverviewSection title="In progress" tasks={overview.inProgress} empty="Nothing in progress." />
          <OverviewSection title="Done this week" tasks={overview.doneThisWeek} empty="Nothing done this week yet." />
        </>
      )}
    </>
  )
}
