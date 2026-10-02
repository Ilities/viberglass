import { EmptyState } from '@/components/empty-state'
import { FunLoading } from '@/components/fun-loading'
import { Heading, Subheading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { TabButton } from '@/components/tab-button'
import { useAuth } from '@/context/auth-context'
import { getProjectsList } from '@/data'
import { useSetupRedirect } from '@/pages/setup/useSetupRedirect'
import { getHome } from '@/service/api/home-api'
import type { HomeData, Project } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AskForSomething } from './ask-for-something'
import { HomeThreadRow } from './home-thread-row'
import { filterThreads, HOME_FILTER_LABEL, HOME_FILTERS, landingFor, type HomeFilter } from './home-threads'
import { NextStepsChecklist } from './next-steps-checklist'
import { WorkspaceHealth } from './workspace-health'

const POLL_MS = 30_000

/** Home: the task threads you're in, those that need you first. */
export function HomePage() {
  useSetupRedirect()
  const { user } = useAuth()
  const [home, setHome] = useState<HomeData | null>(null)
  const [spaces, setSpaces] = useState<Project[]>([])
  const [filter, setFilter] = useState<HomeFilter>('all')
  const [failed, setFailed] = useState(false)
  const landing = landingFor(user?.role)

  useEffect(() => {
    if (landing !== '/') return
    let cancelled = false
    const load = () =>
      getHome()
        .then((data) => !cancelled && setHome(data))
        .catch(() => !cancelled && setFailed(true))
    void load()
    getProjectsList()
      .then((projects) => !cancelled && setSpaces(projects))
      .catch(() => undefined)
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [landing])

  if (landing !== '/') return <Navigate to={landing} replace />
  if (!home && !failed) return <FunLoading retro />

  const isAdmin = user?.role === 'admin'
  const canCreate = user?.role === 'admin' || user?.role === 'member'
  const needsYou = home?.needsYou ?? []
  const threads = filterThreads(home?.threads ?? [], filter)
  const empty = needsYou.length === 0 && (home?.threads.length ?? 0) === 0

  return (
    <>
      <PageMeta title="Home" />
      <Heading>Home</Heading>
      {isAdmin && <NextStepsChecklist />}
      {isAdmin && <WorkspaceHealth />}
      {failed && <p className="mt-6 text-sm text-red-600">Your tasks couldn&apos;t be loaded. Try again in a moment.</p>}

      {empty && !failed ? (
        <div className="mt-8">
          <EmptyState
            title="Nothing here yet"
            description="The tasks you ask for, own, review or are mentioned on show up here."
            action={canCreate ? <AskForSomething spaces={spaces} /> : undefined}
          />
        </div>
      ) : (
        <>
          {needsYou.length > 0 && (
            <section aria-label="Needs you" className="mt-8">
              <Subheading>Needs you</Subheading>
              <ul className="mt-3 space-y-2">
                {needsYou.map((thread) => (
                  <HomeThreadRow key={thread.task.id} thread={thread} />
                ))}
              </ul>
            </section>
          )}
          <section aria-label="Your tasks" className="mt-8">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Subheading>Your tasks</Subheading>
              {canCreate && <AskForSomething spaces={spaces} />}
            </div>
            <div role="group" aria-label="Show" className="mt-2 flex border-b border-[var(--gray-a5)]">
              {HOME_FILTERS.map((value) => (
                <TabButton key={value} active={filter === value} onClick={() => setFilter(value)}>
                  {HOME_FILTER_LABEL[value]}
                </TabButton>
              ))}
            </div>
            {threads.length === 0 ? (
              <p className="mt-4 text-sm text-[var(--gray-10)]">
                {filter === 'unread' ? 'Nothing unread.' : filter === 'mine' ? "You don't own any other tasks." : 'No other tasks.'}
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {threads.map((thread) => (
                  <HomeThreadRow key={thread.task.id} thread={thread} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </>
  )
}
