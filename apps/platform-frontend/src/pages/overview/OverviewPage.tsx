import { FunLoading } from '@/components/fun-loading'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { TabButton } from '@/components/tab-button'
import { getOverview } from '@/service/api/home-api'
import type { OverviewData, OverviewGroup } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { OverviewSection } from './overview-section'

const POLL_MS = 30_000

/** In the order a reader acts on them; a task is in only one. */
const GROUPS: Array<{ key: OverviewGroup; title: string; empty: string }> = [
  { key: 'needsAttention', title: 'Needs attention', empty: 'Nothing is failed, paused, asking, or waiting long.' },
  { key: 'liveNow', title: 'Agent working', empty: 'No agent is working right now.' },
  { key: 'waiting', title: 'Waiting on people', empty: 'Nothing is waiting on anyone.' },
  { key: 'notStarted', title: 'Not started', empty: 'Every task has been started.' },
  { key: 'doneThisWeek', title: 'Done this week', empty: 'Nothing done this week yet.' },
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
          <dl aria-label="Totals" className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {GROUPS.map(({ key, title }) => (
              <div key={key} className="rounded-lg border border-zinc-950/10 bg-white p-3 dark:border-white/10 dark:bg-zinc-900">
                <dt className="text-xs text-[var(--gray-10)]">{title}</dt>
                <dd className="mt-1 text-2xl font-semibold text-[var(--gray-12)]">{overview[key].length}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-[var(--gray-10)]">Each task is counted once, in the first group that fits it.</p>
          {!space && overview.spaces.length > 1 && (
            <ul aria-label="Spaces" className="mt-4 space-y-1 text-sm text-[var(--gray-11)]">
              {overview.spaces.map((entry) => (
                <li key={entry.slug}>
                  <span className="font-medium">{entry.name}</span>:{' '}
                  {GROUPS.map(({ key, title }) => `${entry[key]} ${title.toLowerCase()}`).join(' · ')}
                </li>
              ))}
            </ul>
          )}
          {GROUPS.map(({ key, title, empty }) => (
            <OverviewSection key={key} title={title} tasks={overview[key]} empty={empty} />
          ))}
        </>
      )}
    </>
  )
}
