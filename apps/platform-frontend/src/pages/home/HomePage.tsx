import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { FilterPills } from '@/components/filter-pills'
import { FunLoading } from '@/components/fun-loading'
import { ListPanel } from '@/components/list-panel'
import { PageHeader } from '@/components/page-header'
import { PageMeta } from '@/components/page-meta'
import { SectionHeader } from '@/components/section-header'
import { useAuth } from '@/context/auth-context'
import { useApiRefresh } from '@/hooks/useApiRefresh'
import { getProjectsList } from '@/data'
import { isRunner } from '@/lib/roles'
import { useSetupRedirect } from '@/pages/setup/useSetupRedirect'
import { getHome } from '@/service/api/home-api'
import type { HomeData, Project } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { AskForSomething } from './ask-for-something'
import { ConversationRow, NeedsYouRow } from './home-thread-row'
import {
  attentionLine,
  filterThreads,
  greeting,
  HOME_FILTER_LABEL,
  HOME_FILTERS,
  landingFor,
  type HomeFilter,
} from './home-threads'
import { NextStepsChecklist } from './next-steps-checklist'
import { WorkspaceHealth } from './workspace-health'
import { HomeProgress } from './home-progress'

const POLL_MS = 30_000

/** Home: the conversations you're in, those that need you first. */
export function HomePage() {
  useSetupRedirect()
  const { user } = useAuth()
  const [home, setHome] = useState<HomeData | null>(null)
  const [spaces, setSpaces] = useState<Project[]>([])
  const [filter, setFilter] = useState<HomeFilter>('all')
  const [failed, setFailed] = useState<string | null>(null)
  const [reloads, setReloads] = useState(0)
  const [showAllNeeds, setShowAllNeeds] = useState(false)
  const [showAllThreads, setShowAllThreads] = useState(false)
  const [attentionTab, setAttentionTab] = useState<'now' | 'waiting' | 'later'>('now')
  const revision = useApiRefresh('/api/spaces', '/api/tasks', '/api/home', '/api/setup/space', '/api/setup/demo')
  const reload = () => setReloads((count) => count + 1)
  const landing = landingFor(user?.role)

  useEffect(() => {
    if (landing !== '/') return
    let cancelled = false
    const load = () =>
      getHome()
        .then((data) => {
          if (cancelled) return
          setHome(data)
          setFailed(null)
        })
        .catch((error: unknown) =>
          !cancelled && setFailed(error instanceof Error ? error.message : "Couldn't load your tasks")
        )
    void load()
    getProjectsList()
      .then((projects) => !cancelled && setSpaces(projects))
      .catch(() => undefined)
    const timer = setInterval(() => void load(), POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [landing, reloads, revision])

  if (landing !== '/') return <Navigate to={landing} replace />
  if (!home && !failed) return <FunLoading retro />

  const isAdmin = user?.role === 'admin'
  const canCreate = isRunner(user?.role)
  const needsYou = home?.needsYou ?? []
  const waiting = home?.waiting ?? []
  const later = home?.later ?? []
  const visibleAttention = attentionTab === 'now' ? needsYou : attentionTab === 'waiting' ? waiting : later
  const threads = filterThreads(home?.threads ?? [], filter)
  const empty = needsYou.length === 0 && waiting.length === 0 && later.length === 0 && (home?.threads.length ?? 0) === 0
  const firstName = user?.name?.split(' ')[0]

  return (
    <>
      <PageMeta title="Home" />
      <PageHeader
        title={firstName ? `${greeting(new Date())}, ${firstName}` : 'Home'}
        description={attentionLine(needsYou.length)}
        actions={canCreate && !empty ? <AskForSomething spaces={spaces} /> : undefined}
      />
      {failed && (
        <div className="mb-6 space-y-3 text-sm">
          <p className="text-red-700 dark:text-red-400">{failed}</p>
          <Button outline onClick={reload}>
            Try again
          </Button>
        </div>
      )}

      {empty && !failed ? (
        <EmptyState
          title="Nothing here yet"
          description="The tasks you ask for, own, review or are mentioned on show up here."
          action={canCreate ? <AskForSomething spaces={spaces} /> : undefined}
        />
      ) : (
        <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
          <div>
          <nav aria-label="Your requests" className="mb-6 flex flex-wrap gap-5 border-b border-[var(--gray-5)]">
            {([{ key: 'now', label: 'Now', count: needsYou.length }, { key: 'waiting', label: 'Waiting', count: waiting.length }, { key: 'later', label: 'Later', count: later.length }] as const).map((tab) => <button key={tab.key} type="button" aria-current={attentionTab === tab.key ? 'page' : undefined} onClick={() => { setAttentionTab(tab.key); setShowAllNeeds(false) }} className={`border-b-2 pb-3 text-sm ${attentionTab === tab.key ? 'border-[var(--accent-9)] text-[var(--gray-12)]' : 'border-transparent text-[var(--gray-10)]'}`}>{tab.label} <span className="text-xs">{tab.count}</span></button>)}
          </nav>
          {visibleAttention.length > 0 && (
            <section aria-labelledby="home-needs-you" className="mb-8">
              <h2 id="home-needs-you" className="mb-3 flex items-center gap-2 text-base font-semibold">{attentionTab === 'now' ? 'Needs you' : attentionTab === 'waiting' ? 'Waiting on a discussion' : 'Reminders'} <span className="rounded bg-[var(--gray-3)] px-1.5 text-xs font-medium text-[var(--gray-11)]">{visibleAttention.length}</span></h2>
              <ul className="space-y-3">
                {(showAllNeeds ? visibleAttention : visibleAttention.slice(0, 5)).map((thread) => (
                  <NeedsYouRow key={thread.task.id} thread={thread} onChanged={reload} />
                ))}
              </ul>
              {visibleAttention.length > 5 && <button type="button" className="mt-3 text-sm text-[var(--gray-11)] underline" onClick={() => setShowAllNeeds((value) => !value)}>{showAllNeeds ? 'Show less' : `View all ${visibleAttention.length} tasks`}</button>}
            </section>
          )}
          {visibleAttention.length === 0 && <p className="mb-8 text-sm text-[var(--gray-10)]">{attentionTab === 'now' ? 'Nothing needs your action now.' : attentionTab === 'waiting' ? 'Nothing is waiting on a discussion.' : 'No reminders set.'}</p>}
          <section aria-labelledby="home-conversations" className="mb-8">
            <SectionHeader id="home-conversations" title="Your conversations" />
            <FilterPills
              label="Show"
              value={filter}
              onChange={(value) => { setFilter(value); setShowAllThreads(false) }}
              options={HOME_FILTERS.map((value) => ({ value, label: HOME_FILTER_LABEL[value] }))}
            />
            {threads.length === 0 ? (
              <p className="text-sm text-[var(--gray-10)]">
                {filter === 'unread'
                  ? 'Nothing unread.'
                  : filter === 'mine'
                    ? "You don't own any other tasks."
                    : 'No other conversations.'}
              </p>
            ) : (
              <ListPanel>
                {(showAllThreads ? threads : threads.slice(0, 5)).map((thread) => (
                  <ConversationRow key={thread.task.id} thread={thread} />
                ))}
              </ListPanel>
            )}
            {threads.length > 5 && <button type="button" className="mt-3 text-sm text-[var(--gray-11)] underline" onClick={() => setShowAllThreads((value) => !value)}>{showAllThreads ? 'Show less' : `View all ${threads.length} conversations`}</button>}
          </section>
          </div>
          <HomeProgress threads={[...needsYou, ...waiting, ...later, ...(home?.threads ?? [])]} />
        </div>
      )}
      {isAdmin && <NextStepsChecklist />}
      {isAdmin && <WorkspaceHealth />}
    </>
  )
}
