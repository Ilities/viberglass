import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { ProjectReadinessBanner } from '@/components/project-readiness'
import { useProject } from '@/context/project-context'
import { archiveTickets, deleteTicket, setTicketStatus, updateTicket } from '@/service/api/ticket-api'
import { TICKET_STATUS } from '@viberglass/types'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DeleteTicketDialog } from './delete-ticket-dialog'
import { SituationLine } from './situation-line'
import { EditTicketDialog, type EditTicketValues } from './edit-ticket-dialog'
import { decideTaskNextMove, TASK_STEPS, type TaskStep } from './task-next-move'
import { TaskActionsMenu } from './task-actions-menu'
import { TaskFacts } from './task-facts'
import { TaskFailureNotice } from './task-failure-notice'
import { TaskStepView, type StepView } from './task-step-view'
import { TaskStepper } from './task-stepper'
import { workingSession, useTaskPage } from './use-task-page'
import { TaskThread } from './task-thread'
import { runnableAgents, taskAgents } from './task-agents'

const LONG_DESCRIPTION = 280

function isTaskStep(value: string | null | undefined): value is TaskStep {
  return TASK_STEPS.some((step) => step === value)
}

const STEP_VIEWS: StepView[] = ['document', 'runs', 'comments']
function isStepView(value: string | null): value is StepView {
  return STEP_VIEWS.some((view) => view === value)
}

function Description({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false)
  const body = text.replace(/\\n/g, '\n')
  const isLong = body.length > LONG_DESCRIPTION
  return (
    <div className="max-w-3xl text-[15px] leading-7 text-[var(--gray-11)]">
      <p className={isLong && !expanded ? 'line-clamp-3 whitespace-pre-wrap' : 'whitespace-pre-wrap'}>{body}</p>
      {isLong && (
        <button type="button" onClick={() => setExpanded(!expanded)} className="mt-1 text-sm text-[var(--gray-10)] hover:text-[var(--gray-12)]">
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  )
}

/** A task: its thread, with the artifact being made beside it on wide screens. */
export function TicketDetailPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const { project: space } = useProject()
  const navigate = useNavigate()
  const { data, isLoading, reload, setTicket, setDocument } = useTaskPage(id)
  const [searchParams, setSearchParams] = useSearchParams()
  const [openRunId, setOpenRunId] = useState<string | null>(searchParams.get('run'))
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  // Below the two-column width, one of conversation or artifact shows at a time; a link to a run or document opens the artifact.
  const wide = useMediaQuery('(min-width: 1280px)')
  const [narrowView, setNarrowView] = useState<'conversation' | 'artifact'>(() =>
    ['run', 'step', 'view', 'version'].some((key) => searchParams.has(key)) ? 'artifact' : 'conversation'
  )

  const linkedRunId = searchParams.get('run')
  const changed = useCallback(() => void reload().catch(() => undefined), [reload])
  // The step view counts new comments as people add and resolve them; the page's counts are from its last load.
  const [liveNewComments, setLiveNewComments] = useState<Partial<Record<'research' | 'planning', number>>>({})
  const countNewComments = useCallback(
    (step: 'research' | 'planning', count: number) => setLiveNewComments((current) => (current[step] === count ? current : { ...current, [step]: count })),
    []
  )

  // A link to a run opens it; if it's new, load it.
  const linkedRunMissing = Boolean(linkedRunId && data && !data.runs.some((run) => run.jobId === linkedRunId))
  useEffect(() => {
    if (linkedRunId) setOpenRunId(linkedRunId)
  }, [linkedRunId])
  useEffect(() => {
    if (linkedRunMissing) changed()
  }, [linkedRunMissing, changed])

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
    documents: data.documents,
    workingSession: workingSession(data.sessions),
  })

  const failedRunnerId = move.kind === 'failed' ? data.runs.find((run) => run.jobId === move.runId)?.clankerId : null
  const failedRunner = data.clankers.find((clanker) => clanker.id === failedRunnerId)

  // A linked run shows its step; otherwise the step picked, or the current one.
  const linkedRun = data.runs.find((run) => run.jobId === linkedRunId)
  const requestedStep = searchParams.get('step')
  const shownStep: TaskStep = isTaskStep(linkedRun?.jobKind) ? linkedRun.jobKind : isTaskStep(requestedStep) ? requestedStep : currentStep

  // A linked run opens on the Runs view; otherwise the view picked, or the document.
  const requestedView = searchParams.get('view')
  const shownView: StepView = isStepView(requestedView) ? requestedView : linkedRun ? 'runs' : 'document'

  // An earlier version of the shown document, opened from the thread.
  const requestedVersion = Number(searchParams.get('version'))
  const shownVersion = shownStep !== 'execution' && Number.isInteger(requestedVersion) && requestedVersion > 0 ? requestedVersion : null

  const showStep = (step: TaskStep, version: number | null = null) =>
    setSearchParams({ ...(step === currentStep ? {} : { step }), ...(version ? { version: String(version) } : {}) })
  const showView = (view: StepView) =>
    setSearchParams({ ...(shownStep === currentStep ? {} : { step: shownStep }), ...(view === 'document' ? {} : { view }) })
  const toggleRun = (runId: string) => setOpenRunId((open) => (open === runId ? null : runId))
  // The thread reloads when anything it shows may have changed.
  const threadRefreshKey = [
    ...data.runs.map((run) => `${run.jobId}:${run.status}`),
    ...data.sessions.map((session) => `${session.id}:${session.status}`),
    data.documents.research.updatedAt,
    data.documents.planning.updatedAt,
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
        <Breadcrumbs items={[{ label: space?.name ?? project, href: `/spaces/${project}` }, { label: ticket.key }]} />
        {space?.viewerAccess?.canMaintain && <ProjectReadinessBanner projectId={ticket.projectId} showDemoNotice={false} />}

        <header className="space-y-3">
          <div className="flex items-start justify-between gap-6">
            <div className="min-w-0 space-y-1">
              <Heading className="text-2xl leading-tight">{ticket.title}</Heading>
              {ticket.situation && <SituationLine situation={ticket.situation} />}
            </div>
            <TaskActionsMenu
              ticket={ticket}
              space={project}
              capabilities={capabilities}
              onEdit={() => setIsEditDialogOpen(true)}
              onSetDone={(done) => void setDone(done)}
              onArchive={() => void archive()}
              onDelete={() => setIsDeleteDialogOpen(true)}
            />
          </div>
          {ticket.description && <Description text={ticket.description} />}
        </header>

        {!wide && (
          <div role="group" aria-label="Show" className="flex gap-2">
            <Button
              {...(narrowView === 'conversation' ? { color: 'zinc' as const } : { outline: true as const })}
              aria-pressed={narrowView === 'conversation'}
              onClick={() => setNarrowView('conversation')}
            >
              Conversation
            </Button>
            <Button
              {...(narrowView === 'artifact' ? { color: 'zinc' as const } : { outline: true as const })}
              aria-pressed={narrowView === 'artifact'}
              onClick={() => setNarrowView('artifact')}
            >
              Artifacts
            </Button>
            {capabilities?.canPost && (
              <Button
                plain
                className="ml-auto"
                onClick={() => {
                  setNarrowView('conversation')
                  // After the conversation is shown again, so the composer can take focus.
                  requestAnimationFrame(() => {
                    const composer = document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Write a message"]')
                    composer?.scrollIntoView({ block: 'center', behavior: 'smooth' })
                    composer?.focus({ preventScroll: true })
                  })
                }}
              >
                Write a reply
              </Button>
            )}
          </div>
        )}

        {/* Hidden rather than unmounted, so a draft and the scroll position survive switching. */}
        <div className="grid min-h-0 flex-1 gap-10 xl:grid-cols-2">
          <section
            aria-label="Artifact"
            hidden={!wide && narrowView !== 'artifact'}
            className="min-w-0 space-y-6 xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:self-start xl:overflow-y-auto">
            <TaskStepper
              currentStep={currentStep}
              move={move}
              shownStep={shownStep}
              exists={{
                research: data.documents.research.content.trim().length > 0,
                planning: data.documents.planning.content.trim().length > 0,
                execution: Boolean(ticket.pullRequestUrl),
              }}
              canAsk={Boolean(capabilities?.canAsk)}
              onShowStep={showStep}
            />
            <TaskStepView
              step={shownStep}
              view={shownView}
              version={shownVersion}
              onView={showView}
              data={data}
              project={project}
              move={move}
              openRunId={openRunId}
              focusedRunId={linkedRunId}
              focusedRunTab={searchParams.get('runTab')}
              onToggleRun={toggleRun}
              onDocumentSaved={setDocument}
              onNewComments={countNewComments}
            />
          </section>

          <div hidden={!wide && narrowView !== 'conversation'} className="min-w-0 space-y-8 xl:order-first">
            <TaskFacts ticket={ticket} collapsed={!wide} />
            <TaskThread
              taskId={ticket.id}
              taskKey={ticket.key}
              project={project}
              refreshKey={threadRefreshKey}
              onOpenComments={(step) => {
                setNarrowView('artifact')
                setSearchParams({ ...(step === currentStep ? {} : { step }), view: 'comments' })
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              onOpenArtifact={(step, version) => {
                setNarrowView('artifact')
                showStep(step, version)
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
                documents: data.documents,
                capabilities,
                newComments: { ...data.newComments, ...liveNewComments },
                agentWorking: move.kind === 'working',
                lastFailure: move.kind === 'failed' ? move.failure : null,
              }}
            />
          </div>
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
