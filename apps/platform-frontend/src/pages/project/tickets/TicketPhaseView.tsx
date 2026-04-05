import { Badge } from '@/components/badge'
import { ClipboardIcon, ExternalLinkIcon } from '@radix-ui/react-icons'
import type { ApprovalState } from '@/service/api/ticket-api'
import { TICKET_WORKFLOW_PHASE, type Clanker, type Ticket } from '@viberglass/types'
import { toast } from 'sonner'
import { PhaseSection } from './phase-section'
import { TicketLogsSummary } from './phase-logs'
import { formatDate, formatDateTime, formatTicketStatus, getSeverityBadge } from './ticket-display'
import { JobListItem } from '@/service/api/job-api'

interface TicketPhaseViewProps {
  ticket: Ticket
  clankers: Clanker[]
  project: string
  onWorkflowPhaseChange: (phase: Ticket['workflowPhase']) => void
  onApprovalStateChange: (state: ApprovalState) => void
  onResolve: () => Promise<void>
  jobs: JobListItem[]
}

function SidebarLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[10px] font-semibold tracking-widest text-[var(--gray-8)] uppercase">{children}</span>
}

function SidebarField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[var(--gray-9)]">{label}</span>
      <span className="text-sm font-medium text-[var(--gray-12)]">{children}</span>
    </div>
  )
}

export function TicketPhaseView({
  ticket,
  clankers,
  project,
  onWorkflowPhaseChange,
  onApprovalStateChange,
  onResolve,
  jobs,
}: TicketPhaseViewProps) {
  const statusBadge = formatTicketStatus(ticket.status)
  const severityBadge = getSeverityBadge(ticket.severity)
  const displayId = ticket.id.length > 16 ? `${ticket.id.slice(0, 8)}…${ticket.id.slice(-6)}` : ticket.id

  const currentPhase = ticket.workflowPhase

  return (
    <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-12">
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
                {currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH
                  ? 'Research'
                  : currentPhase === TICKET_WORKFLOW_PHASE.PLANNING
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
                  <SidebarField label="Overridden at">{formatDateTime(ticket.workflowOverriddenAt)}</SidebarField>
                </div>
              </div>
            </>
          )}

          <div className="my-5 h-px bg-[var(--gray-4)]" />

          <div>
            <SidebarLabel>Agent Runs</SidebarLabel>
            <div className="mt-3">
              <TicketLogsSummary jobs={jobs} project={project} />
            </div>
          </div>
        </div>
      </div>

      <div className="lg:col-span-9 xl:col-span-9 space-y-4">
        {ticket.description && (
          <div className="rounded-xl border border-[var(--gray-5)] bg-[var(--gray-1)] p-6">
            <h3 className="mb-3 text-sm font-semibold text-[var(--gray-12)]">Description</h3>
            <div className="text-sm leading-relaxed whitespace-pre-wrap text-[var(--gray-11)]">
              {ticket.description.replace(/\\n/g, '\n')}
            </div>
          </div>
        )}

        <PhaseSection
          ticket={ticket}
          clankers={clankers}
          project={project}
          phase="research"
          currentPhase={currentPhase}
          onWorkflowPhaseChange={onWorkflowPhaseChange}
          onApprovalStateChange={onApprovalStateChange}
          jobs={jobs}
        />

        <PhaseSection
          ticket={ticket}
          clankers={clankers}
          project={project}
          phase="planning"
          currentPhase={currentPhase}
          onWorkflowPhaseChange={onWorkflowPhaseChange}
          onApprovalStateChange={onApprovalStateChange}
          jobs={jobs}
        />

        <PhaseSection
          ticket={ticket}
          clankers={clankers}
          project={project}
          phase="execution"
          currentPhase={currentPhase}
          onWorkflowPhaseChange={onWorkflowPhaseChange}
          onApprovalStateChange={onApprovalStateChange}
          onResolve={onResolve}
          jobs={jobs}
        />
      </div>
    </div>
  )
}