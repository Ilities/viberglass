import { Button } from '@/components/button'
import { FunLoading } from '@/components/fun-loading'
import { PageMeta } from '@/components/page-meta'
import { ProjectReadinessBanner } from '@/components/project-readiness'
import { SpacePageBar } from '@/components/space-page-bar'
import { useProject } from '@/context/project-context'
import { useApiRefresh } from '@/hooks/useApiRefresh'
import { DashboardMetrics } from '@/pages/overview/dashboard-metrics'
import { CollapsedOverviewSection } from '@/pages/overview/collapsed-overview-section'
import { OverviewOutcomes } from '@/pages/overview/overview-outcomes'
import { OverviewSection } from '@/pages/overview/overview-section'
import { getOverview } from '@/service/api/home-api'
import type { OverviewData } from '@viberglass/types'
import { useEffect, useState } from 'react'
import { Navigate, useLocation, useParams } from 'react-router-dom'

/** The space overview; the complete task browser remains a separate tab. */
export function SpaceSummary() {
  const { project: slug = '' } = useParams<{ project: string }>()
  const { project: space } = useProject()
  const { search } = useLocation()
  const [overview, setOverview] = useState<OverviewData | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const revision = useApiRefresh('/api/spaces', '/api/tasks', '/api/jobs')

  useEffect(() => {
    if (!slug || search) return
    let cancelled = false
    const load = () => getOverview(slug).then((data) => {
      if (!cancelled) { setOverview(data); setError(false) }
    }).catch(() => { if (!cancelled) setError(true) })
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [slug, search, revision, retry])

  if (search) return <Navigate to={`/spaces/${slug}/tasks${search}`} replace />
  if (!overview && !error) return <FunLoading retro />

  return (
    <>
      <PageMeta title={space?.name ?? slug} />
      <SpacePageBar description="Decisions, conversations, and work in this space." actions={space?.viewerAccess?.canCreateTasks && <Button href={`/spaces/${slug}/tasks/new`} color="brand">Create task</Button>} />
      {space?.viewerAccess?.canMaintain && <div className="mb-6 empty:hidden"><ProjectReadinessBanner projectId={space.id} firstTaskHref={`/spaces/${slug}/tasks/new`} showDemoNotice={false} /></div>}
      {error && <div className="mb-6 text-sm"><p className="mb-3 text-red-700 dark:text-red-400">Couldn&apos;t refresh this space{overview ? '; showing the last loaded information' : ''}.</p><Button outline onClick={() => setRetry((value) => value + 1)}>Try again</Button></div>}
      {overview && <>
        <DashboardMetrics overview={overview} />
        <div className="grid gap-x-10 lg:grid-cols-[minmax(0,1fr)_minmax(220px,280px)]">
          <div>
            <OverviewSection id="overview-needsAttention" title="Needs attention" empty="Nothing needs attention right now." badged tasks={overview.needsAttention} />
            <CollapsedOverviewSection id="overview-waiting" title="Waiting on people" empty="Nothing is waiting on anyone." tasks={overview.waiting} />
            <CollapsedOverviewSection id="overview-notStarted" title="Not started" empty="Every task has been started." tasks={overview.notStarted} />
            <p className="mb-8"><Button href={`/spaces/${slug}/tasks`} outline>Browse all tasks</Button></p>
          </div>
          <div>
            <OverviewSection id="overview-liveNow" title="Agent working" empty="No agent is working right now." tasks={overview.liveNow} />
            <OverviewOutcomes tasks={overview.doneThisWeek} />
          </div>
        </div>
      </>}
    </>
  )
}
