import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import type { ApprovalState } from '@/service/api/ticket-api'
import type { AgentSession, AgentSessionMode } from '@/service/api/session-api'
import { ChatBubbleIcon, ClipboardIcon, ExternalLinkIcon } from '@radix-ui/react-icons'
import { Tabs } from '@radix-ui/themes'
import { type Clanker, type Ticket, TICKET_WORKFLOW_PHASE } from '@viberglass/types'
import { toast } from 'sonner'
import { formatDate, formatDateTime, formatTicketStatus, getSeverityBadge } from './ticket-display'
import { PlanningDocumentPanel } from './planning-document-panel'
import { ResearchDocumentPanel } from './research-document-panel'
import { InlineSessionPanel } from './InlineSessionPanel'

const ACTIVE_SESSION_STATUSES = new Set(['active', 'waiting_on_user', 'waiting_on_approval'])

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

interface TicketDetailTabsProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
  currentSession: AgentSession | null
  activeTab: string
  onTabChange: (tab: string) => void
  onWorkflowPhaseChange: (phase: Ticket['workflowPhase']) => void
  onApprovalStateChange: (state: ApprovalState) => void
  onStartSession: (mode: AgentSessionMode, prefilledMessage: string) => void
  onSendToSession: (message: string, mode: AgentSessionMode) => void
  onSessionEnded: () => void
  onOpenSessionDialog: () => void
  documentRefreshKey?: number
}

export function TicketDetailTabs({
  ticket,
  clankers,
  project,
  currentSession,
  activeTab,
  onTabChange,
  onWorkflowPhaseChange,
  onApprovalStateChange,
  onStartSession,
  onSendToSession,
  onSessionEnded,
  onOpenSessionDialog,
  documentRefreshKey,
}: TicketDetailTabsProps) {
  const sessionIsActive = currentSession ? ACTIVE_SESSION_STATUSES.has(currentSession.status) : false
  const statusBadge = formatTicketStatus(ticket.status)
  const severityBadge = getSeverityBadge(ticket.severity)
  const displayId = ticket.id.length > 16
    ? `${ticket.id.slice(0, 8)}…${ticket.id.slice(-6)}`
    : ticket.id

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-12">
      {/* Left sidebar */}
      <div className="lg:col-span-3 xl:col-span-3">
        <div className="rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-5">
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
                      {ticket.ticketSystem}
                      <ExternalLinkIcon className="h-3 w-3" />
                    </a>
                  ) : (
                    ticket.ticketSystem
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

          <div>
            <SidebarLabel>Timeline</SidebarLabel>
            <div className="mt-3 space-y-3">
              <SidebarField label="Created">{formatDate(ticket.createdAt)}</SidebarField>
              <SidebarField label="Updated">{formatDateTime(ticket.updatedAt)}</SidebarField>
              {ticket.metadata?.timestamp && (
                <SidebarField label="Reported">{formatDate(ticket.metadata.timestamp as string)}</SidebarField>
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
        <Tabs.Root value={activeTab} onValueChange={onTabChange}>
          <Tabs.List>
            <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
            <Tabs.Trigger value="research">Research</Tabs.Trigger>
            <Tabs.Trigger value="planning">Planning</Tabs.Trigger>
            <Tabs.Trigger value="session">
              <span className="flex items-center gap-1.5">
                Session
                {sessionIsActive && (
                  <span className="inline-block h-2 w-2 rounded-full bg-green-500" title="Active session" />
                )}
              </span>
            </Tabs.Trigger>
          </Tabs.List>

          <Tabs.Content value="overview">
            <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
              <h3 className="mb-4 text-sm font-semibold text-[var(--gray-12)]">Description</h3>
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
                onWorkflowPhaseChange={onWorkflowPhaseChange}
                activeSession={currentSession}
                onStartSession={onStartSession}
                onSendToSession={(msg) => onSendToSession(msg, 'research')}
                refreshKey={documentRefreshKey}
              />
            </div>
          </Tabs.Content>

          <Tabs.Content value="planning">
            <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-7">
              <PlanningDocumentPanel
                ticket={ticket}
                clankers={clankers}
                project={project}
                onWorkflowPhaseChange={onWorkflowPhaseChange}
                onApprovalStateChange={onApprovalStateChange}
                activeSession={currentSession}
                onStartSession={onStartSession}
                onSendToSession={(msg) => onSendToSession(msg, 'planning')}
                refreshKey={documentRefreshKey}
              />
            </div>
          </Tabs.Content>

          <Tabs.Content value="session">
            <div className="mt-4 rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-5">
              {currentSession ? (
                <InlineSessionPanel
                  sessionId={currentSession.id}
                  project={project}
                  onSessionEnded={onSessionEnded}
                  onRevise={
                    currentSession.mode === 'research' || currentSession.mode === 'planning'
                      ? () => { onStartSession(currentSession.mode as AgentSessionMode, ''); onTabChange(currentSession.mode) }
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--gray-6)] bg-[var(--gray-2)] p-12 text-center">
                  <ChatBubbleIcon className="h-8 w-8 text-[var(--gray-8)]" />
                  <div>
                    <p className="text-sm font-medium text-[var(--gray-11)]">No active session</p>
                    <p className="mt-1 text-sm text-[var(--gray-9)]">
                      Start an interactive ACP session to guide the agent in real time.
                    </p>
                  </div>
                  <Button color="brand" onClick={onOpenSessionDialog}>
                    <ChatBubbleIcon className="h-4 w-4" />
                    Start session
                  </Button>
                </div>
              )}
            </div>
          </Tabs.Content>
        </Tabs.Root>
      </div>
    </div>
  )
}
