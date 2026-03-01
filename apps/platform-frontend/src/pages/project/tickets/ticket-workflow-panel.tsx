import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from '@viberglass/types'

interface TicketWorkflowPanelProps {
  workflowPhase: TicketWorkflowPhase
  isAdvancing?: boolean
  onAdvance?: (phase: TicketWorkflowPhase) => Promise<void>
  blockingReason?: string | null
  overrideAudit?: {
    reason: string
    overriddenAt: string
    overriddenBy: string | null
  } | null
}

const phases: { phase: TicketWorkflowPhase; label: string }[] = [
  { phase: TICKET_WORKFLOW_PHASE.RESEARCH, label: 'Research' },
  { phase: TICKET_WORKFLOW_PHASE.PLANNING, label: 'Planning' },
  { phase: TICKET_WORKFLOW_PHASE.EXECUTION, label: 'Execution' },
]

function getPhaseStatus(
  currentPhase: TicketWorkflowPhase,
  phase: TicketWorkflowPhase,
): 'completed' | 'current' | 'upcoming' {
  const currentIndex = phases.findIndex((p) => p.phase === currentPhase)
  const phaseIndex = phases.findIndex((p) => p.phase === phase)

  if (phaseIndex < currentIndex) return 'completed'
  if (phaseIndex === currentIndex) return 'current'
  return 'upcoming'
}

function getStatusBadge(status: 'completed' | 'current' | 'upcoming'): {
  label: string
  color: 'green' | 'blue' | 'zinc'
} {
  if (status === 'completed') return { label: 'Done', color: 'green' }
  if (status === 'current') return { label: 'Current', color: 'blue' }
  return { label: 'Upcoming', color: 'zinc' }
}

function getAdvanceAction(currentPhase: TicketWorkflowPhase): {
  phase: TicketWorkflowPhase
  label: string
} | null {
  if (currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH) {
    return { phase: TICKET_WORKFLOW_PHASE.PLANNING, label: 'Move to Planning' }
  }
  if (currentPhase === TICKET_WORKFLOW_PHASE.PLANNING) {
    return { phase: TICKET_WORKFLOW_PHASE.EXECUTION, label: 'Move to Execution' }
  }
  return null
}

export function TicketWorkflowPanel({
  workflowPhase,
  isAdvancing = false,
  onAdvance,
  blockingReason = null,
  overrideAudit = null,
}: TicketWorkflowPanelProps) {
  const advanceAction = onAdvance ? getAdvanceAction(workflowPhase) : null

  return (
    <div className="app-frame rounded-lg px-5 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          {phases.map((entry, index) => {
            const status = getPhaseStatus(workflowPhase, entry.phase)
            const badge = getStatusBadge(status)

            return (
              <div key={entry.phase} className="flex items-center gap-4">
                {index > 0 && (
                  <div className="h-px w-6 bg-[var(--gray-6)]" />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[var(--gray-11)]">
                    {entry.label}
                  </span>
                  <Badge color={badge.color}>{badge.label}</Badge>
                </div>
              </div>
            )
          })}
        </div>

        {advanceAction ? (
          <Button
            color="brand"
            onClick={() => void onAdvance?.(advanceAction.phase)}
            disabled={isAdvancing}
          >
            {isAdvancing ? 'Updating...' : advanceAction.label}
          </Button>
        ) : null}
      </div>
      {blockingReason ? (
        <div className="mt-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {blockingReason}
        </div>
      ) : null}
      {overrideAudit ? (
        <div className="mt-3 rounded-md border border-orange-300/70 bg-orange-50 px-3 py-2 text-sm text-orange-900">
          <div className="font-medium">Execution override recorded</div>
          <div className="mt-1">
            {overrideAudit.overriddenBy ? `${overrideAudit.overriddenBy} on ` : ''}
            {new Date(overrideAudit.overriddenAt).toLocaleString()}
          </div>
          <div className="mt-1 whitespace-pre-wrap">{overrideAudit.reason}</div>
        </div>
      ) : null}
    </div>
  )
}
