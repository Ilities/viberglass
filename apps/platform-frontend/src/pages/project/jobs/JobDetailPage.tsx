import { Breadcrumbs } from '@/components/breadcrumbs'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { TabButton } from '@/components/tab-button'
import { useAuth } from '@/context/auth-context'
import { formatJobKind } from '@/data'
import { useJobStatus } from '@/hooks/useJobStatus'
import { cancelJob } from '@/service/api/job-api'
import { useState } from 'react'
import { Navigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { CodexDeviceAuthCard, resolveCodexDeviceAuthPrompt } from './codex-device-auth-card'
import { JobRefreshButton } from './job-refresh-button'
import { RunActivity } from './run-activity'
import { formatRunDuration, RunFacts } from './run-facts'
import { decideRunNextStep } from './run-next-step'
import { RunNextStepCard } from './run-next-step-card'
import { RunPrompt } from './run-prompt'
import { RunLog } from './run-log'
import { RunRecordPanel } from './run-record-panel'
import { resolveRunTab, type RunTab } from './run-tab'
import { findNewerRun, useRunContext } from './use-run-context'

export function JobDetailPage() {
  const { project, jobId } = useParams<{ project: string; jobId: string }>()
  const { job, isLoading, error, isPolling, refetch } = useJobStatus(jobId)
  const context = useRunContext(job)
  const [searchParams] = useSearchParams()
  const isAdmin = useAuth().user?.role === 'admin'
  const [activeTab, setActiveTab] = useState<RunTab>(() => resolveRunTab(searchParams.get('runTab'), isAdmin))
  const [isCancelling, setIsCancelling] = useState(false)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading run…</div>
      </div>
    )
  }

  if (error || !job || !jobId || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Run not found</div>
      </div>
    )
  }

  // A task's runs live on the task, opened at this run; this page is for runs without one (schedules).
  if (job.ticketId) {
    const runTab = searchParams.get('runTab')
    return <Navigate to={`/spaces/${project}/tasks/${job.ticketId}?run=${job.jobId}${runTab ? `&runTab=${encodeURIComponent(runTab)}` : ''}`} replace />
  }

  const kind = formatJobKind(job.jobKind)
  const title = job.ticket?.title ?? job.data.context?.clawTemplateName ?? `${kind} run`
  const duration = formatRunDuration(job.processedAt, job.finishedAt)
  const taskHref = job.ticketId ? `/spaces/${project}/tasks/${job.ticketId}` : null
  const codexPrompt = job.status === 'active' ? resolveCodexDeviceAuthPrompt(job.progressUpdates ?? [], job.progress) : null

  const refresh = () => {
    void refetch()
    void context.reload()
  }

  const handleCancel = async () => {
    setIsCancelling(true)
    try {
      await cancelJob(job.jobId)
      await refetch()
      toast.success('Run cancelled')
    } catch (cancelError) {
      toast.error(cancelError instanceof Error ? cancelError.message : 'Failed to cancel run')
    } finally {
      setIsCancelling(false)
    }
  }

  const nextStep = decideRunNextStep({
    job,
    newerRunId: findNewerRun(job, context.taskRuns),
    taskPhase: context.ticket?.workflowPhase ?? job.ticket?.workflowPhase ?? null,
    document: context.document,
  })

  return (
    <>
      <PageMeta title={`${title} | ${kind} run`} />
      <div className="flex h-full flex-col">
        <Breadcrumbs
          items={[
            { label: project, href: `/spaces/${project}` },
            ...(job.ticket && taskHref ? [{ label: job.ticket.title, href: taskHref }] : [{ label: 'Runs', href: `/spaces/${project}/runs` }]),
            { label: `${kind} run` },
          ]}
        />

        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-8 gap-y-4 border-b border-[var(--gray-6)]">
          <div className="min-w-0 pb-4">
            <Heading className="text-2xl">{title}</Heading>
            <p className="mt-1 text-sm text-[var(--gray-10)]">
              {kind} run
              {job.clanker && <> · {job.clanker.name}</>}
              {job.processedAt && <> · started {new Date(job.processedAt).toLocaleString()}</>}
              {duration && <> · {job.finishedAt ? `took ${duration}` : `running for ${duration}`}</>}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')}>
              Activity
            </TabButton>
            <TabButton active={activeTab === 'prompt'} onClick={() => setActiveTab('prompt')}>
              Prompt
            </TabButton>
            <TabButton active={activeTab === 'log'} onClick={() => setActiveTab('log')}>
              Raw log
            </TabButton>
            {isAdmin && (
              <TabButton active={activeTab === 'record'} onClick={() => setActiveTab('record')}>
                Record
              </TabButton>
            )}
            <div className="mb-1 ml-2">
              <JobRefreshButton onRefresh={refresh} />
            </div>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 gap-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
          <main className="min-w-0">
            {activeTab === 'activity' && (
              <RunActivity
                job={job}
                project={project}
                onShowRawLog={() => setActiveTab('log')}
                nextStep={
                  <div className="space-y-4">
                    {codexPrompt && <CodexDeviceAuthCard prompt={codexPrompt} />}
                    <RunNextStepCard
                      step={nextStep}
                      job={job}
                      project={project}
                      ticket={context.ticket}
                      clankers={context.clankers}
                      cancel={{ isCancelling, onConfirm: () => void handleCancel() }}
                      onChanged={refresh}
                    />
                  </div>
                }
              />
            )}
            {activeTab === 'prompt' && <RunPrompt job={job} />}
            {activeTab === 'log' && <RunLog job={job} isPolling={isPolling} />}
            {activeTab === 'record' && isAdmin && <RunRecordPanel jobId={job.jobId} />}
          </main>

          <aside className="space-y-8 lg:border-l lg:border-[var(--gray-6)] lg:pl-8">
            <RunFacts job={job} isPolling={isPolling} />
          </aside>
        </div>
      </div>
    </>
  )
}
