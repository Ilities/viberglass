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

const POLL_MS = 30_000

/** Home: the conversations you're in, those that need you first. */
export function HomePage() {
  useSetupRedirect()
  const { user } = useAuth()
  const [home, setHome] = useState<HomeData | null>(null)
  const [spaces, setSpaces] = useState<Project[]>([])
  const [filter, setFilter] = useState<HomeFilter>('all')
  const [failed, setFailed] = useState(false)
  const [reloads, setReloads] = useState(0)
  const revision = useApiRefresh('/api/spaces', '/api/tasks', '/api/setup/space', '/api/setup/demo')
  const reload = () => setReloads((count) => count + 1)
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
  }, [landing, reloads, revision])

  if (landing !== '/') return <Navigate to={landing} replace />
  if (!home && !failed) return <FunLoading retro />

  const isAdmin = user?.role === 'admin'
  const canCreate = isRunner(user?.role)
  const needsYou = home?.needsYou ?? []
  const threads = filterThreads(home?.threads ?? [], filter)
  const empty = needsYou.length === 0 && (home?.threads.length ?? 0) === 0
  const firstName = user?.name?.split(' ')[0]

  return (
    <>
      <PageMeta title="Home" />
      <PageHeader
        eyebrow="Your workspace"
        title={firstName ? `${greeting(new Date())}, ${firstName}` : 'Home'}
        description={attentionLine(needsYou.length)}
        actions={canCreate && !empty ? <AskForSomething spaces={spaces} /> : undefined}
      />
      {isAdmin && <NextStepsChecklist />}
      {failed && (
        <p className="mb-6 text-sm text-red-600">Your tasks couldn&apos;t be loaded. Try again in a moment.</p>
      )}

      {empty && !failed ? (
        <EmptyState
          title="Nothing here yet"
          description="The tasks you ask for, own, review or are mentioned on show up here."
          action={canCreate ? <AskForSomething spaces={spaces} /> : undefined}
        />
      ) : (
        <>
          {needsYou.length > 0 && (
            <section aria-labelledby="home-needs-you" className="mb-8">
              <SectionHeader id="home-needs-you" title="Needs you" count={needsYou.length} />
              <ListPanel>
                {needsYou.map((thread) => (
                  <NeedsYouRow key={thread.task.id} thread={thread} onChanged={reload} />
                ))}
              </ListPanel>
            </section>
          )}
          <section aria-labelledby="home-conversations" className="mb-8">
            <SectionHeader id="home-conversations" title="Your conversations" />
            <FilterPills
              label="Show"
              value={filter}
              onChange={setFilter}
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
                {threads.map((thread) => (
                  <ConversationRow key={thread.task.id} thread={thread} />
                ))}
              </ListPanel>
            )}
          </section>
        </>
      )}
      {isAdmin && <WorkspaceHealth />}
    </>
  )
}
