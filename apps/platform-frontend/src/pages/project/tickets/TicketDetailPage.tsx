import { Button } from '@/components/button'
import { EmptyState } from '@/components/empty-state'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownMenu } from '@/components/dropdown'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { ProjectReadinessBanner } from '@/components/project-readiness'
import { deleteTicket, setTicketStatus, updateTicket } from '@/service/api/ticket-api'
import {
  CheckCircledIcon,
  ChevronDownIcon,
  ClipboardIcon,
  EyeOpenIcon,
  Pencil1Icon,
  ResetIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { TICKET_STATUS } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { DeleteTicketDialog } from './delete-ticket-dialog'
import { SituationLine } from './situation-line'
import { EditTicketDialog, type EditTicketValues } from './edit-ticket-dialog'
import { decideTaskNextMove, TASK_STEPS, type TaskStep } from './task-next-move'
import { TaskNextMoveBanner } from './task-next-move-banner'
import { TaskSidebar } from './task-sidebar'
import { TaskStepView, type StepView } from './task-step-view'
import { TaskStepper } from './task-stepper'
import { workingSession, useTaskPage } from './use-task-page'
import { TaskThread } from './task-thread'
import { taskAgents } from './task-agents'

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

export function TicketDetailPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const navigate = useNavigate()
  const { data, isLoading, reload, setTicket, setDocument } = useTaskPage(id)
  const [searchParams, setSearchParams] = useSearchParams()
  const [openRunId, setOpenRunId] = useState<string | null>(searchParams.get('run'))
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  const linkedRunId = searchParams.get('run')
  const changed = useCallback(() => void reload().catch(() => undefined), [reload])
  // The step view counts new comments as people add and resolve them; the page's counts are from its last load.
  const [liveNewComments, setLiveNewComments] = useState<Partial<Record<'research' | 'planning', number>>>({})
  const countNewComments = useCallback(
    (step: 'research' | 'planning', count: number) => setLiveNewComments((current) => (current[step] === count ? current : { ...current, [step]: count })),
    []
  )

  // A link to a run (including one a banner action just started) opens it; if it's new, load it.
  const linkedRunMissing = Boolean(linkedRunId && data && !data.runs.some((run) => run.jobId === linkedRunId))
  useEffect(() => {
    if (linkedRunId) setOpenRunId(linkedRunId)
  }, [linkedRunId])
  useEffect(() => {
    if (linkedRunMissing) changed()
  }, [linkedRunMissing, changed])

  const setStatus = useCallback(
    async (status: (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS], message: string) => {
      if (!data) return
      try {
        const updated =
          status === TICKET_STATUS.RESOLVED ? await updateTicket(data.ticket.id, { status }) : await setTicketStatus(data.ticket.id, status)
        setTicket(updated)
        toast.success(message)
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

  const { ticket } = data
  const currentStep = ticket.workflowPhase
  const move = decideTaskNextMove({
    ticket,
    runs: data.runs,
    documents: data.documents,
    workingSession: workingSession(data.sessions),
  })

  // A linked run shows its step; otherwise the step picked, or the current one.
  const linkedRun = data.runs.find((run) => run.jobId === linkedRunId)
  const requestedStep = searchParams.get('step')
  const shownStep: TaskStep = isTaskStep(linkedRun?.jobKind) ? linkedRun.jobKind : isTaskStep(requestedStep) ? requestedStep : currentStep

  // A linked run opens on the Runs view; otherwise the view picked, or the document.
  const requestedView = searchParams.get('view')
  const shownView: StepView = isStepView(requestedView) ? requestedView : linkedRun ? 'runs' : 'document'

  const showStep = (step: TaskStep) => setSearchParams(step === currentStep ? {} : { step })
  const showView = (view: StepView) =>
    setSearchParams({ ...(shownStep === currentStep ? {} : { step: shownStep }), ...(view === 'document' ? {} : { view }) })
  const openRun = (runId: string) => {
    setOpenRunId(runId)
    setSearchParams({ run: runId, view: 'runs' })
  }
  const toggleRun = (runId: string) => setOpenRunId((open) => (open === runId ? null : runId))
  // The thread reloads when anything it shows may have changed.
  const threadRefreshKey = [
    ...data.runs.map((run) => `${run.jobId}:${run.status}`),
    ...data.sessions.map((session) => `${session.id}:${session.status}`),
    data.documents.research.updatedAt,
    data.documents.planning.updatedAt,
    ticket.updatedAt,
  ].join('|')

  return (
    <>
      <PageMeta title={`${ticket.title} | Task`} />
      <div className="flex h-full flex-col gap-6">
        <Breadcrumbs
          items={[
            { label: project, href: `/spaces/${project}` },
            { label: 'Tasks', href: `/spaces/${project}/tasks` },
            { label: ticket.title },
          ]}
        />
        <ProjectReadinessBanner projectId={ticket.projectId} showDemoNotice={false} />

        <div className="grid min-h-0 flex-1 gap-10 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <main className="min-w-0 space-y-7">
            <header className="space-y-3">
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 space-y-1">
                  <Heading className="text-2xl leading-tight">{ticket.title}</Heading>
                  {ticket.situation && <SituationLine situation={ticket.situation} />}
                </div>
                <Dropdown>
                  <DropdownButton outline className="shrink-0">
                    Actions
                    <ChevronDownIcon data-slot="icon" />
                  </DropdownButton>
                  <DropdownMenu>
                    <DropdownItem onClick={() => setIsEditDialogOpen(true)}>
                      <Pencil1Icon className="size-4" />
                      Edit details
                    </DropdownItem>
                    {ticket.screenshot && (
                      <DropdownItem href={`/spaces/${project}/tasks/${ticket.id}/media`}>
                        <EyeOpenIcon className="size-4" />
                        View screenshots
                      </DropdownItem>
                    )}
                    <DropdownItem
                      onClick={() => {
                        void navigator.clipboard.writeText(ticket.id)
                        toast.success('Task ID copied')
                      }}
                    >
                      <ClipboardIcon className="size-4" />
                      Copy task ID
                    </DropdownItem>
                    <DropdownDivider />
                    {ticket.status === TICKET_STATUS.RESOLVED ? (
                      <DropdownItem onClick={() => void setStatus(TICKET_STATUS.OPEN, 'Task reopened')}>
                        <ResetIcon className="size-4" />
                        Reopen
                      </DropdownItem>
                    ) : (
                      <DropdownItem onClick={() => void setStatus(TICKET_STATUS.RESOLVED, 'Task marked as done')}>
                        <CheckCircledIcon className="size-4" />
                        Mark as done
                      </DropdownItem>
                    )}
                    <DropdownItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600">
                      <TrashIcon className="size-4" />
                      Delete task
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </div>
              {ticket.description && <Description text={ticket.description} />}
            </header>

            <TaskNextMoveBanner
              move={move}
              data={data}
              project={project}
              onChanged={changed}
              onResolve={() => setStatus(TICKET_STATUS.RESOLVED, 'Task marked as done')}
              onShowRun={openRun}
            />

            <section className="space-y-6">
              <TaskStepper currentStep={currentStep} move={move} shownStep={shownStep} onShowStep={showStep} />
              <TaskStepView
                step={shownStep}
                view={shownView}
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

            <TaskThread
              taskId={ticket.id}
              project={project}
              refreshKey={threadRefreshKey}
              onOpenArtifact={(step) => {
                showStep(step)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              agents={taskAgents(data.clankers, data.sessions)}
              canAsk={Boolean(data.capabilities?.canAsk)}
              onAsked={changed}
              suggestionInput={{
                ticket,
                documents: data.documents,
                capabilities: data.capabilities,
                newComments: { ...data.newComments, ...liveNewComments },
                agentWorking: move.kind === 'working',
              }}
            />
          </main>

          <TaskSidebar data={data} project={project} openRunId={openRunId} onOpenRun={openRun} />
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
            navigate(`/spaces/${project}/tasks`)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete task')
          }
        }}
      />
    </>
  )
}
