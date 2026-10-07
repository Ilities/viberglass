import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { PageMeta } from '@/components/page-meta'
import { ProjectReadinessBanner } from '@/components/project-readiness'
import { useProject } from '@/context/project-context'
import { useAuth } from '@/context/auth-context'
import { isRunner } from '@/lib/roles'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { archiveTickets, deleteTicket, setTicketStatus, updateTicket } from '@/service/api/ticket-api'
import { TICKET_STATUS } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DeleteTicketDialog } from './delete-ticket-dialog'
import { EditTicketDialog, type EditTicketValues } from './edit-ticket-dialog'
import { TaskActionsMenu } from './task-actions-menu'
import { runnableAgents, taskAgents } from './task-agents'
import { runName } from './step-runs'
import { TaskContextLine } from './task-context-line'
import { TaskDescription } from './task-description'
import { TaskRunHistory } from './task-run-history'
import { TaskRunInspector } from './task-run-inspector'
import { TaskFailureNotice } from './task-failure-notice'
import { TaskHeader } from './task-header'
import { codeProgress, decideTaskNextMove, TASK_STEPS, type TaskStep } from './task-next-move'
import { WatchButton } from './task-people'
import { TaskStepView, type StepView } from './task-step-view'
import { TaskStepper } from './task-stepper'
import { TaskThread } from './task-thread'
import { TaskViewSwitch } from './task-view-switch'
import { useTaskPage, workingSession } from './use-task-page'
import { useTaskParticipants } from './use-task-participants'

function isTaskStep(value: string | null | undefined): value is TaskStep {
  return TASK_STEPS.some((step) => step === value)
}

const STEP_VIEWS: StepView[] = ['document', 'comments']
function isStepView(value: string | null): value is StepView {
  return STEP_VIEWS.some((view) => view === value)
}

/** A task: its thread, with the artifact being made beside it on wide screens. */
export function TicketDetailPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const { project: space } = useProject()
  const { user } = useAuth()
  const canInspectRuns = isRunner(user?.role)
  const navigate = useNavigate()
  const { data, isLoading, reload, setTicket, setDocument } = useTaskPage(id)
  // The page's address may name the task by its key; people are looked up by its id.
  const people = useTaskParticipants(data?.ticket.id)
  const [searchParams, setSearchParams] = useSearchParams()
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  // Hidden panels stay mounted so switching preserves a draft and its scroll position.
  const wide = useMediaQuery('(min-width: 1280px)')
  const [narrowView, setNarrowView] = useState<'conversation' | 'artifact'>(() =>
    ['step', 'version'].some((key) => searchParams.has(key)) || searchParams.get('view') === 'comments' ? 'artifact' : 'conversation'
  )

  const linkedRunId = searchParams.get('run')
  const changed = useCallback(() => void reload().catch(() => undefined), [reload])
  // The step view counts new comments as people add and resolve them; the page's counts are from its last load.
  const [liveNewComments, setLiveNewComments] = useState<number | null>(null)
  const countNewComments = useCallback((count: number) => setLiveNewComments(count), [])

  // A link to a run opens it; if it's new, load it.
  const linkedRunMissing = Boolean(linkedRunId && data && !data.runs.some((run) => run.jobId === linkedRunId))
  useEffect(() => {
    if (linkedRunMissing) changed()
  }, [linkedRunMissing, changed])

  const closeRun = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.delete('run')
    next.delete('runTab')
    setSearchParams(next, { replace: true })
  }, [searchParams, setSearchParams])

  const setDone = useCallback(
    async (done: boolean) => {
      if (!data) return
      try {
        const updated = done
          ? await updateTicket(data.ticket.id, { status: TICKET_STATUS.RESOLVED })
          : await setTicketStatus(data.ticket.id, TICKET_STATUS.OPEN)
        setTicket(updated)
        toast.success(done ? 'Task finished. Its history stays; finishing merges nothing.' : 'Task reopened')
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to update the task')
      }
    },
    [data, setTicket]
  )

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading task…</div>
      </div>
    )
  }
  if (!data || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <EmptyState
          title="This task doesn't exist, or you don't have access to it"
          action={<Button href="/">Go home</Button>}
        />
      </div>
    )
  }

  const { ticket, capabilities } = data
  const currentStep = ticket.workflowPhase
  const move = decideTaskNextMove({
    ticket,
    runs: data.runs,
    plan: data.plan,
    workingSession: workingSession(data.sessions),
  })

  const failedRunnerId = move.kind === 'failed' ? data.runs.find((run) => run.jobId === move.runId)?.clankerId : null
  const failedRunner = data.clankers.find((clanker) => clanker.id === failedRunnerId)

  const linkedRun = data.runs.find((run) => run.jobId === linkedRunId)
  const requestedStep = searchParams.get('step')
  const shownStep: TaskStep = isTaskStep(requestedStep) ? requestedStep : currentStep
  const requestedView = searchParams.get('view')
  const shownView: StepView = isStepView(requestedView) ? requestedView : 'document'

  // An earlier version of the shown document, opened from the thread.
  const requestedVersion = Number(searchParams.get('version'))
  const shownVersion =
    shownStep !== 'execution' && Number.isInteger(requestedVersion) && requestedVersion > 0 ? requestedVersion : null

  const showStep = (step: TaskStep, version: number | null = null, compare = false) =>
    setSearchParams({
      ...(linkedRunId ? { run: linkedRunId } : {}),
      ...(searchParams.get('runTab') ? { runTab: searchParams.get('runTab') ?? '' } : {}),
      ...(step === currentStep ? {} : { step }),
      ...(version ? { version: String(version) } : {}),
      ...(compare ? { compare: '1' } : {}),
    })
  const showView = (view: StepView) =>
    setSearchParams({
      ...(linkedRunId ? { run: linkedRunId } : {}),
      ...(searchParams.get('runTab') ? { runTab: searchParams.get('runTab') ?? '' } : {}),
      ...(shownStep === currentStep ? {} : { step: shownStep }),
      ...(view === 'document' ? {} : { view }),
    })
  // The thread reloads when anything it shows may have changed.
  const threadRefreshKey = [
    ...data.runs.map((run) => `${run.jobId}:${run.status}`),
    ...data.sessions.map((session) => `${session.id}:${session.status}`),
    data.plan.updatedAt,
    ticket.updatedAt,
  ].join('|')

  const archive = async () => {
    try {
      await archiveTickets([ticket.id])
      toast.success('Task archived')
      navigate(`/spaces/${project}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to archive the task')
    }
  }

  return (
    <>
      <PageMeta title={`${ticket.title} | Task`} />
      <div className="flex h-full flex-col gap-6">
        {space?.viewerAccess?.canMaintain && (
          <ProjectReadinessBanner projectId={ticket.projectId} showDemoNotice={false} />
        )}
        <TaskHeader
          ticket={ticket}
          spaceName={space?.name ?? project}
          project={project}
          actions={
            <>
              <WatchButton taskId={ticket.id} people={people} />
              <TaskActionsMenu
                ticket={ticket}
                space={project}
                capabilities={capabilities}
                onEdit={() => setIsEditDialogOpen(true)}
                onSetDone={(done) => void setDone(done)}
                onArchive={() => void archive()}
                onDelete={() => setIsDeleteDialogOpen(true)}
              />
            </>
          }
        />
        <TaskContextLine ticket={ticket} people={people} />
        <TaskDescription key={ticket.id} description={ticket.description} />

        {!wide && <TaskViewSwitch view={narrowView} onView={setNarrowView} canPost={Boolean(capabilities?.canPost)} />}

        {/* Hidden rather than unmounted, so a draft and the scroll position survive switching. */}
        <div className="grid min-h-0 flex-1 items-start gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
          <section
            aria-label="Artifact"
            hidden={!wide && narrowView !== 'artifact'}
            className="min-w-0 overflow-hidden rounded-[9px] border border-[var(--gray-5)] bg-[var(--color-panel-solid)] xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto"
          >
            <div className="border-b border-[var(--gray-5)] bg-[var(--gray-2)] px-5 pt-4 pb-3">
              <TaskStepper
                currentStep={currentStep}
                move={move}
                shownStep={shownStep}
                exists={{
                  planning: data.plan.content.trim().length > 0,
                  execution: Boolean(ticket.pullRequestUrl),
                }}
                codeProgress={codeProgress(data.planParts)}
                onShowStep={showStep}
              />
            </div>
            <div className="px-6 py-5 max-sm:px-4">
              <TaskStepView
                step={shownStep}
                view={shownView}
                version={shownVersion}
                comparing={searchParams.get('compare') === '1'}
                onCompare={(version) => showStep(shownStep, version, true)}
                onView={showView}
                data={data}
                move={move}
                onDocumentSaved={setDocument}
                onNewComments={countNewComments}
                onAsked={changed}
              />
            </div>
          </section>

          <div hidden={!wide && narrowView !== 'conversation'} className="min-w-0 space-y-4 xl:order-first">
            {canInspectRuns && <TaskRunHistory key={ticket.id} runs={data.runs} open={requestedView === 'runs'} />}
            <TaskThread
              taskId={ticket.id}
              refreshKey={threadRefreshKey}
              runs={data.runs}
              onOpenComments={() => {
                setNarrowView('artifact')
                setSearchParams({ ...(currentStep === 'planning' ? {} : { step: 'planning' }), view: 'comments' })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onOpenArtifact={(version) => {
                setNarrowView('artifact')
                showStep('planning', version)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              agents={taskAgents(data.clankers, data.sessions)}
              canPost={Boolean(capabilities?.canPost)}
              canAsk={Boolean(capabilities?.canAsk)}
              canSteer={Boolean(capabilities?.canSteer)}
              paused={data.sessions.some((session) => session.status === 'paused')}
              pausedForSetup={move.kind === 'failed' && move.failure?.category === 'setup'}
              mentionsYou={Boolean(ticket.mentionsYou)}
              notice={<TaskFailureNotice move={move} project={project} runner={failedRunner} />}
              runnableAgents={runnableAgents(data.clankers)}
              clankers={data.clankers}
              onAsked={changed}
              suggestionInput={{
                ticket,
                plan: data.plan,
                capabilities,
                newComments: liveNewComments ?? data.newComments,
                agentWorking: move.kind === 'working',
                lastFailure: move.kind === 'failed' ? move.failure : null,
                planParts: data.planParts,
              }}
            />
          </div>
          {canInspectRuns && (
            <TaskRunInspector
              jobId={linkedRunId}
              title={linkedRun ? `${runName(linkedRun.jobKind)} #${data.runs.length - data.runs.indexOf(linkedRun)}` : 'Run details'}
              linkedTab={searchParams.get('runTab')}
              onClose={closeRun}
            />
          )}
        </div>
      </div>

      <EditTicketDialog
        ticket={ticket}
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={async (updates: EditTicketValues) => {
          try {
            setTicket(await updateTicket(ticket.id, updates))
            setIsEditDialogOpen(false)
            toast.success('Task updated')
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update task')
          }
        }}
      />
      <DeleteTicketDialog
        ticket={ticket}
        open={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={async () => {
          try {
            await deleteTicket(ticket.id)
            toast.success('Task deleted')
            navigate(`/spaces/${project}`)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete task')
          }
        }}
      />
    </>
  )
}
