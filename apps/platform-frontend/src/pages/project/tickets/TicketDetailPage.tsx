import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Dropdown, DropdownButton, DropdownDivider, DropdownItem, DropdownMenu } from '@/components/dropdown'
import { Heading } from '@/components/heading'
import { PageMeta } from '@/components/page-meta'
import { formatTicketSystem, getClankersList, getTicketDetails } from '@/data'
import {
  ArrowLeftIcon,
  ChatBubbleIcon,
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
import { Tabs } from '@radix-ui/themes'
import { type Clanker, type Ticket, TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from '@viberglass/types'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import {
  type ApprovalState,
  deleteTicket,
  getPlanningPhase,
  setTicketWorkflowPhase,
  updateTicket,
} from '@/service/api/ticket-api'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { DeleteTicketDialog } from './delete-ticket-dialog'
import { EditTicketDialog, type EditTicketValues } from './edit-ticket-dialog'
import { PlanningDocumentPanel } from './planning-document-panel'
import { ResearchDocumentPanel } from './research-document-panel'
import { TicketRunButton } from './ticket-run-button'
import { formatTicketStatus } from './ticket-display'
import { TicketWorkflowPanel } from './ticket-workflow-panel'
import { LaunchSessionDialog } from '../sessions/LaunchSessionDialog'
import { WorkflowOverrideDialog } from './workflow-override-dialog'
import { listSessionsForTicket, type AgentSession } from '@/service/api/session-api'

function getSeverityBadge(severity: string): { label: string; color: 'red' | 'amber' | 'green' | 'zinc' } {
  switch (severity) {
    case 'critical':
      return { label: 'Critical', color: 'red' }
    case 'high':
      return { label: 'High', color: 'amber' }
    case 'medium':
      return { label: 'Medium', color: 'amber' }
    case 'low':
      return { label: 'Low', color: 'green' }
    default:
      return { label: 'Unknown', color: 'zinc' }
  }
}

function getAutoFixBadge(status?: string): { label: string; color: 'green' | 'amber' | 'red' | 'zinc' } {
  switch (status) {
    case 'completed':
      return { label: 'Fixed', color: 'green' }
    case 'in_progress':
      return { label: 'Fixing', color: 'amber' }
    case 'pending':
      return { label: 'Pending', color: 'amber' }
    case 'failed':
      return { label: 'Failed', color: 'red' }
    default:
      return { label: 'Not Requested', color: 'zinc' }
  }
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(dateString: string): string {
  return new Date(dateString).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--gray-8)]">
      {children}
    </span>
  )
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[var(--gray-9)]">{label}</span>
      <span className="text-sm font-medium text-[var(--gray-12)]">{children}</span>
    </div>
  )
}

export function TicketDetailPage() {
  const { project, id } = useParams<{ project: string; id: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [clankers, setClankers] = useState<Clanker[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [planningApprovalState, setPlanningApprovalState] = useState<ApprovalState | null>(null)
  const [isWorkflowOverrideDialogOpen, setIsWorkflowOverrideDialogOpen] = useState(false)
  const [isLaunchSessionDialogOpen, setIsLaunchSessionDialogOpen] = useState(false)
  const [activeSessions, setActiveSessions] = useState<AgentSession[]>([])

  useEffect(() => {
    async function loadData() {
      if (!id) {
        setIsLoading(false)
        return
      }

      try {
        const [t, c, planningPhase, sessions] = await Promise.all([
          getTicketDetails(id),
          getClankersList(),
          getPlanningPhase(id),
          listSessionsForTicket(id),
        ])
        setActiveSessions(sessions.filter(s =>
          s.status === 'active' || s.status === 'waiting_on_user' || s.status === 'waiting_on_approval'
        ))
        if (!t) {
          setIsLoading(false)
          return
        }
        setTicket(t)
        setClankers(c)
        setPlanningApprovalState(planningPhase.document.approvalState)
      } finally {
        setIsLoading(false)
      }
    }
    void loadData()
  }, [id])

  const executionBlockingReason = useMemo(() => {
    if (!ticket) return null
    if (ticket.workflowOverriddenAt) return null
    if (planningApprovalState === 'approved') return null

    if (ticket.workflowPhase === TICKET_WORKFLOW_PHASE.RESEARCH) {
      return 'Execution is blocked until research is completed and the planning document is approved.'
    }

    return 'Execution is blocked until the planning document is approved.'
  }, [planningApprovalState, ticket])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-[var(--gray-9)]">Loading ticket details...</div>
      </div>
    )
  }

  if (!ticket || !project) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-red-600 dark:text-red-400">Ticket not found</div>
      </div>
    )
  }

  const severityBadge = getSeverityBadge(ticket.severity)
  const autoFixBadge = getAutoFixBadge(ticket.autoFixStatus)
  const statusBadge = formatTicketStatus(ticket.status)

  function phaseToTab(phase: TicketWorkflowPhase): string {
    if (phase === TICKET_WORKFLOW_PHASE.RESEARCH) return 'research'
    if (phase === TICKET_WORKFLOW_PHASE.PLANNING) return 'planning'
    return 'overview'
  }

  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const isRunnable = !executionBlockingReason && activeClankers.length > 0

  const displayId = ticket.id.length > 16
    ? `${ticket.id.slice(0, 8)}…${ticket.id.slice(-6)}`
    : ticket.id

  return (
    <>
      <PageMeta title={ticket ? `#${ticket.id.slice(-4)} | Ticket` : 'Ticket'} />
      <div className="flex h-full flex-col gap-5">

        {/* Back link */}
        <div>
          <Button href={`/project/${project}/tickets`} plain className="-ml-1">
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Tickets
          </Button>
        </div>

        {/* Header */}
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

          {/* Actions */}
          <div className="flex shrink-0 items-center gap-2">
            {activeSessions.length > 0 && (
              <Button
                href={`/project/${project}/sessions/${activeSessions[0].id}`}
                color="violet"
              >
                <ChatBubbleIcon className="h-4 w-4" />
                Resume session
              </Button>
            )}
            {/* Primary CTA — context-aware */}
            {isRunnable ? (
              <TicketRunButton
                ticket={ticket}
                clankers={clankers}
                project={project}
                disabled={false}
              />
            ) : executionBlockingReason ? (
              <Button color="amber" onClick={() => setIsWorkflowOverrideDialogOpen(true)}>
                <PlayIcon className="h-4 w-4" />
                Force Execute
              </Button>
            ) : (
              <TicketRunButton
                ticket={ticket}
                clankers={clankers}
                project={project}
                disabled={true}
                disabledReason={executionBlockingReason ?? undefined}
              />
            )}

            {/* Overflow menu */}
            <Dropdown>
              <DropdownButton outline aria-label="More actions">
                <DotsHorizontalIcon className="h-4 w-4" />
              </DropdownButton>
              <DropdownMenu>
                <DropdownItem onClick={() => setIsEditDialogOpen(true)}>
                  <Pencil1Icon className="h-4 w-4" />
                  Edit ticket
                </DropdownItem>
                {ticket.externalTicketUrl && (
                  <DropdownItem href={ticket.externalTicketUrl} target="_blank">
                    <ExternalLinkIcon className="h-4 w-4" />
                    View external ticket
                  </DropdownItem>
                )}
                {ticket.screenshot && (
                  <DropdownItem href={`/project/${project}/tickets/${ticket.id}/media`}>
                    <EyeOpenIcon className="h-4 w-4" />
                    View screenshots
                  </DropdownItem>
                )}
                {activeSessions.length > 0 ? (
                  <DropdownItem href={`/project/${project}/sessions/${activeSessions[0].id}`}>
                    <ChatBubbleIcon className="h-4 w-4" />
                    View active session
                  </DropdownItem>
                ) : (
                  <DropdownItem onClick={() => setIsLaunchSessionDialogOpen(true)}>
                    <ChatBubbleIcon className="h-4 w-4" />
                    Start interactive session
                  </DropdownItem>
                )}
                <DropdownItem
                  onClick={() => {
                    void navigator.clipboard.writeText(ticket.id)
                    toast.success('Ticket ID copied')
                  }}
                >
                  <ClipboardIcon className="h-4 w-4" />
                  Copy ticket ID
                </DropdownItem>
                {executionBlockingReason && (
                  <>
                    <DropdownDivider />
                    <DropdownItem onClick={() => setIsWorkflowOverrideDialogOpen(true)}>
                      <CheckCircledIcon className="h-4 w-4" />
                      Force execute (skip R&amp;P)
                    </DropdownItem>
                  </>
                )}
                <DropdownDivider />
                <DropdownItem onClick={() => setIsDeleteDialogOpen(true)} className="text-red-600">
                  <TrashIcon className="h-4 w-4" />
                  Delete ticket
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        </div>

        {/* Phase Beacon — full width */}
        <TicketWorkflowPanel
          workflowPhase={ticket.workflowPhase}
          blockingReason={executionBlockingReason}
          overrideAudit={
            ticket.workflowOverriddenAt
              ? {
                  reason: ticket.workflowOverrideReason || '',
                  overriddenAt: ticket.workflowOverriddenAt,
                  overriddenBy: ticket.workflowOverriddenBy || null,
                }
              : null
          }
        />

        {/* Two-column body */}
        <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-12">

          {/* Left sidebar — unified metadata */}
          <div className="lg:col-span-3 xl:col-span-3">
            <div className="rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-5">
              {/* Classification */}
              <div>
                <SidebarLabel>Classification</SidebarLabel>
                <div className="mt-3 space-y-3">
                  <SidebarField label="Severity">
                    <Badge color={severityBadge.color}>{severityBadge.label}</Badge>
                  </SidebarField>
                  <SidebarField label="Category">{ticket.category}</SidebarField>
                  <SidebarField label="Status">
                    <Badge className={statusBadge.className}>{statusBadge.label}</Badge>
                  </SidebarField>
                  {ticket.ticketSystem && (
                    <SidebarField label="Ticket system">
                      {ticket.externalTicketUrl ? (
                        <a
                          href={ticket.externalTicketUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-[var(--accent-11)] hover:underline"
                        >
                          {formatTicketSystem(ticket.ticketSystem)}
                          <ExternalLinkIcon className="h-3 w-3" />
                        </a>
                      ) : (
                        formatTicketSystem(ticket.ticketSystem)
                      )}
                    </SidebarField>
                  )}
                  <SidebarField label="Workflow phase">
                    {ticket.workflowPhase === TICKET_WORKFLOW_PHASE.RESEARCH
                      ? 'Research'
                      : ticket.workflowPhase === TICKET_WORKFLOW_PHASE.PLANNING
                        ? 'Planning'
                        : 'Execution'}
                  </SidebarField>
                </div>
              </div>

              <div className="my-5 h-px bg-[var(--gray-4)]" />

              {/* Identity */}
              <div>
                <SidebarLabel>Identity</SidebarLabel>
                <div className="mt-3">
                  <span className="text-[11px] text-[var(--gray-9)]">Ticket ID</span>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className="font-mono text-xs text-[var(--gray-11)]">{displayId}</span>
                    <button
                      type="button"
                      title="Copy full ID"
                      onClick={() => {
                        void navigator.clipboard.writeText(ticket.id)
                        toast.success('Ticket ID copied')
                      }}
                      className="text-[var(--gray-8)] transition-colors hover:text-[var(--gray-11)]"
                    >
                      <ClipboardIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="my-5 h-px bg-[var(--gray-4)]" />

              {/* Timeline */}
              <div>
                <SidebarLabel>Timeline</SidebarLabel>
                <div className="mt-3 space-y-3">
                  <SidebarField label="Created">{formatDate(ticket.createdAt)}</SidebarField>
                  <SidebarField label="Updated">{formatDateTime(ticket.updatedAt)}</SidebarField>
                  {ticket.metadata?.timestamp && (
                    <SidebarField label="Reported">{formatDate(ticket.metadata.timestamp)}</SidebarField>
                  )}
                </div>
              </div>

              {ticket.workflowOverriddenAt && (
                <>
                  <div className="my-5 h-px bg-[var(--gray-4)]" />
                  <div>
                    <SidebarLabel>Override</SidebarLabel>
                    <div className="mt-3">
                      <SidebarField label="Overridden at">
                        {formatDateTime(ticket.workflowOverriddenAt)}
                      </SidebarField>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right content column */}
          <div className="lg:col-span-9 xl:col-span-9">
            <Tabs.Root defaultValue={searchParams.get('tab') ?? phaseToTab(ticket.workflowPhase)}>
              <Tabs.List>
                <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
                <Tabs.Trigger value="research">Research</Tabs.Trigger>
                <Tabs.Trigger value="planning">Planning</Tabs.Trigger>
              </Tabs.List>

              <Tabs.Content value="overview">
                <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
                  <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--gray-12)]">
                    <FileTextIcon className="h-4 w-4 text-[var(--accent-9)]" />
                    Description
                  </h3>
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--gray-11)]">
                    {ticket.description
                      ? ticket.description.replace(/\\n/g, '\n')
                      : <span className="italic text-[var(--gray-8)]">No description provided.</span>
                    }
                  </div>
                </div>
              </Tabs.Content>

              <Tabs.Content value="research">
                <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
                  <ResearchDocumentPanel
                    ticket={ticket}
                    clankers={clankers}
                    project={project}
                    onWorkflowPhaseChange={(workflowPhase) =>
                      setTicket((currentTicket) =>
                        currentTicket ? { ...currentTicket, workflowPhase } : currentTicket
                      )
                    }
                  />
                </div>
              </Tabs.Content>

              <Tabs.Content value="planning">
                <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
                  <PlanningDocumentPanel
                    ticket={ticket}
                    clankers={clankers}
                    project={project}
                    onWorkflowPhaseChange={(workflowPhase) =>
                      setTicket((currentTicket) =>
                        currentTicket ? { ...currentTicket, workflowPhase } : currentTicket
                      )
                    }
                    onApprovalStateChange={setPlanningApprovalState}
                  />
                </div>
              </Tabs.Content>
            </Tabs.Root>
          </div>
        </div>
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

      <LaunchSessionDialog
        open={isLaunchSessionDialogOpen}
        onClose={() => setIsLaunchSessionDialogOpen(false)}
        ticketId={ticket.id}
        project={project}
        clankers={clankers}
      />
    </>
  )
}
