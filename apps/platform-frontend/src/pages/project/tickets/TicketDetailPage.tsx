import { Badge } from '@/components/badge'
import { Breadcrumbs } from '@/components/breadcrumbs'
import { Button } from '@/components/button'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownMenu } from '@/components/dropdown'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { formatTicketSystem, getClankersList, getTicketDetails } from '@/data'
import {
  CheckCircledIcon,
  ClipboardIcon,
  DotsHorizontalIcon,
  ExternalLinkIcon,
  EyeOpenIcon,
  FileTextIcon,
  Pencil1Icon,
  PlayIcon,
  TrashIcon,
} from '@radix-ui/react-icons'
import { type Clanker, type Ticket, TICKET_STATUS, TICKET_WORKFLOW_PHASE } from '@viberglass/types'
import { useNavigate, useParams } from 'react-router-dom'
import {
  type ApprovalState,
  deleteTicket,
  getPlanningPhase,
  setTicketWorkflowPhase,
  updateTicket,
} from '@/service/api/ticket-api'
import { getJobs, type JobListItem } from '@/service/api/job-api'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DeleteTicketDialog } from './delete-ticket-dialog'
import { EditTicketDialog, type EditTicketValues } from './edit-ticket-dialog'
import { TicketPhaseView } from './TicketPhaseView'
import { TicketRunButton } from './ticket-run-button'
import { formatTicketStatus, getSeverityBadge, getAutoFixBadge } from './ticket-display'
import { WorkflowOverrideDialog } from './workflow-override-dialog'

export function TicketDetailPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const navigate = useNavigate()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [planningApprovalState, setPlanningApprovalState] = useState<ApprovalState | null>(null)
  const stableSetPlanningApprovalState = useCallback((state: ApprovalState) => {
    setPlanningApprovalState(state)
  }, [])
  const [isWorkflowOverrideDialogOpen, setIsWorkflowOverrideDialogOpen] = useState(false)
  const [jobs, setJobs] = useState<JobListItem[]>([])

  useEffect(() => {
    let cancelled = false
    async function loadData() {
      if (!id) { setIsLoading(false); return }
      try {
        const [t, c, planningPhase, jobsData] = await Promise.all([
          getTicketDetails(id),
          getClankersList(),
          getPlanningPhase(id),
          getJobs({ ticketId: id, limit: 50 }),
        ])
        if (cancelled) return
        if (!t) { setIsLoading(false); return }
        setTicket(t)
        setClankers(c)
        setPlanningApprovalState(planningPhase.document.approvalState)
        setJobs(jobsData.jobs)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    void loadData()
    return () => { cancelled = true }
  }, [id])

  const executionBlockingReason = useMemo(() => {
    if (!ticket) return null
    if (ticket.workflowOverriddenAt) return null
    if (planningApprovalState === 'approved') return null
    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.RESEARCH)
      return 'Execution is blocked until research is completed and the planning document is approved.'
    return 'Execution is blocked until the planning document is approved.'
  }, [planningApprovalState, ticket])

  const handleResolve = useCallback(async () => {
    if (!ticket) return
    try {
      const updated = await updateTicket(ticket.id, { status: TICKET_STATUS.RESOLVED })
      setTicket(updated)
      toast.success('Ticket resolved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to resolve ticket')
    }
  }, [ticket])

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><div className="text-[var(--gray-9)]">Loading ticket details...</div></div>
  }
  if (!ticket || !project) {
    return <div className="flex items-center justify-center py-20"><div className="text-red-600 dark:text-red-400">Ticket not found</div></div>
  }

  const severityBadge = getSeverityBadge(ticket.severity)
  const autoFixBadge = getAutoFixBadge(ticket.autoFixStatus)
  const statusBadge = formatTicketStatus(ticket.status)
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const isRunnable = !executionBlockingReason && activeClankers.length > 0

  return (
    <>
      <PageMeta title={ticket ? `#${ticket.id.slice(-4)} | Ticket` : 'Ticket'} />
      <div className="flex h-full flex-col gap-5">
        <Breadcrumbs
          items={[
            { label: project, href: `/project/${project}` },
            { label: 'Tickets', href: `/project/${project}/tickets` },
            { label: ticket.title },
          ]}
        />

        <div className="flex items-start justify-between gap-6">
          <div className="flex min-w-0 items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent-4)] to-[var(--accent-3)] text-[var(--accent-11)] shadow-sm">
              <FileTextIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <Heading className="text-xl leading-tight">{ticket.title}</Heading>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <Badge color={severityBadge.color}>{severityBadge.label}</Badge>
                <Badge color="blue">{ticket.category}</Badge>
                <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                {ticket.autoFixStatus && (
                  <Badge color={autoFixBadge.color}>Auto-fix: {autoFixBadge.label}</Badge>
                )}
                {ticket.externalTicketId && (
                  <Badge color="violet">
                    {formatTicketSystem(ticket.ticketSystem)} #{ticket.externalTicketId}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isRunnable ? (
              <TicketRunButton ticket={ticket} clankers={clankers} project={project} disabled={false} />
            ) : executionBlockingReason ? (
              <Button color="amber" onClick={() => setIsWorkflowOverrideDialogOpen(true)}>
                <PlayIcon className="h-4 w-4" />
                Force Execute
              </Button>
            ) : (
              <TicketRunButton ticket={ticket} clankers={clankers} project={project} disabled={true} disabledReason={executionBlockingReason ?? undefined} />
            )}
            <Dropdown>
              <DropdownButton outline aria-label="More actions">
                <DotsHorizontalIcon className="h-4 w-4" />
              </DropdownButton>
              <DropdownMenu>
                <DropdownItem onClick={() => setIsEditDialogOpen(true)}>
                  <Pencil1Icon className="h-4 w-4" />Edit ticket
                </DropdownItem>
                {ticket.externalTicketUrl && (
                  <DropdownItem href={ticket.externalTicketUrl} target="_blank">
                    <ExternalLinkIcon className="h-4 w-4" />View external ticket
                  </DropdownItem>
                )}
                {ticket.screenshot && (
                  <DropdownItem href={`/project/${project}/tickets/${ticket.id}/media`}>
                    <EyeOpenIcon className="h-4 w-4" />View screenshots
                  </DropdownItem>
                )}
                <DropdownItem onClick={() => { void navigator.clipboard.writeText(ticket.id); toast.success('Ticket ID copied') }}>
                  <ClipboardIcon className="h-4 w-4" />Copy ticket ID
                </DropdownItem>
                {executionBlockingReason && (
                  <>
                    <DropdownDivider />
                    <DropdownItem onClick={() => setIsWorkflowOverrideDialogOpen(true)}>
                      <CheckCircledIcon className="h-4 w-4" />Force execute (skip R&amp;P)
                    </DropdownItem>
                  </>
                )}
                <DropdownDivider />
                <DropdownItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600">
                  <TrashIcon className="h-4 w-4" />Delete ticket
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        <TicketPhaseView
          ticket={ticket}
          clankers={clankers}
          project={project}
          onWorkflowPhaseChange={(workflowPhase) =>
            setTicket((t) => t ? { ...t, workflowPhase } : t)
          }
          onApprovalStateChange={stableSetPlanningApprovalState}
          onResolve={handleResolve}
          jobs={jobs}
        />
      </div>

      <EditTicketDialog
        ticket={ticket}
        open={isEditDialogOpen}
        onClose={() => setIsEditDialogOpen(false)}
        onSave={async (updates: EditTicketValues) => {
          try {
            const { workflowPhase, ...ticketUpdates } = updates
            let updatedTicket = await updateTicket(ticket.id, ticketUpdates)
            if (workflowPhase !== updatedTicket.workflowPhase) {
              updatedTicket = await setTicketWorkflowPhase(ticket.id, workflowPhase)
            }
            setTicket(updatedTicket)
            setIsEditDialogOpen(false)
            toast.success('Ticket updated successfully')
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to update ticket')
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
            toast.success('Ticket deleted successfully')
            navigate(`/project/${project}/tickets`)
          } catch (error) {
            toast.error(error instanceof Error ? error.message : 'Failed to delete ticket')
          }
        }}
      />
      <WorkflowOverrideDialog
        ticket={ticket}
        open={isWorkflowOverrideDialogOpen}
        onClose={() => setIsWorkflowOverrideDialogOpen(false)}
        onSuccess={(updatedTicket) => {
          setTicket(updatedTicket)
          setIsWorkflowOverrideDialogOpen(false)
          toast.success('Execution override recorded - ticket moved to execution')
        }}
      />
    </>
  )
}