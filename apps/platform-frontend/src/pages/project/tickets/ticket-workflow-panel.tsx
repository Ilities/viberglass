import { CheckIcon } from '@radix-ui/react-icons'
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

function getNextPhase(currentPhase: TicketWorkflowPhase): TicketWorkflowPhase | null {
  const currentIndex = phases.findIndex((p) => p.phase === currentPhase)
  return currentIndex < phases.length - 1 ? phases[currentIndex + 1].phase : null
}

export function TicketWorkflowPanel({
  workflowPhase,
  isAdvancing = false,
  onAdvance,
  blockingReason = null,
  overrideAudit = null,
}: TicketWorkflowPanelProps) {
  const isBlocked = Boolean(blockingReason)
  const nextPhase = getNextPhase(workflowPhase)
  const nextPhaseLabel = nextPhase ? phases.find((p) => p.phase === nextPhase)?.label : null

  return (
    <div
      className="rounded-xl border px-6 py-4"
      style={
        isBlocked
          ? { backgroundColor: 'var(--accent-2)', borderColor: 'var(--accent-6)' }
          : { backgroundColor: 'var(--gray-2)', borderColor: 'var(--gray-5)' }
      }
    >
      {/* Phase rail */}
      <div className="flex items-center">
        {phases.map((entry, index) => {
          const status = getPhaseStatus(workflowPhase, entry.phase)
          const isLast = index === phases.length - 1

          return (
            <div key={entry.phase} className="flex items-center">
              <div className="flex items-center gap-2">
                {/* Step dot */}
                <div
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                  style={
                    status === 'completed'
                      ? { backgroundColor: 'var(--green-9)', color: 'white' }
                      : status === 'current'
                        ? { backgroundColor: 'var(--accent-9)', color: 'var(--accent-12)' }
                        : { backgroundColor: 'var(--gray-4)', color: 'var(--gray-9)' }
                  }
                >
                  {status === 'completed' ? (
                    <CheckIcon className="h-3 w-3" />
                  ) : (
                    <span>{index + 1}</span>
                  )}
                </div>

                {/* Label + Current badge */}
                <div className="flex flex-col">
                  <span
                    className="text-sm font-medium"
                    style={{
                      color:
                        status === 'current'
                          ? 'var(--gray-12)'
                          : status === 'completed'
                            ? 'var(--gray-11)'
                            : 'var(--gray-8)',
                    }}
                  >
                    {entry.label}
                  </span>
                  {status === 'current' && (
                    <span className="text-xs" style={{ color: 'var(--accent-11)' }}>
                      Current
                    </span>
                  )}
                </div>
              </div>

              {/* Connector */}
              {!isLast && (
                <div
                  className="mx-3 h-px w-10 shrink-0"
                  style={{ backgroundColor: status === 'completed' ? 'var(--gray-7)' : 'var(--gray-4)' }}
                />
              )}
            </div>
          )
        })}
      </div>

      {/* Advance button */}
      {nextPhaseLabel && onAdvance && (
        <div className="mt-3">
          <button
            type="button"
            disabled={isAdvancing}
            onClick={() => nextPhase && onAdvance(nextPhase)}
            className="text-sm"
            style={{ color: isAdvancing ? 'var(--gray-8)' : 'var(--accent-11)' }}
          >
            {isAdvancing ? 'Updating...' : `Move to ${nextPhaseLabel}`}
          </button>
        </div>
      )}

      {/* Blocking message */}
      {blockingReason && (
        <p className="mt-2.5 text-sm" style={{ color: 'var(--accent-11)' }}>
          {blockingReason}
        </p>
      )}

      {/* Override audit */}
      {overrideAudit && (
        <div className="mt-3 border-t pt-3 text-sm" style={{ borderColor: 'var(--accent-5)', color: 'var(--accent-11)' }}>
          <span className="font-medium">Override recorded</span>
          {overrideAudit.overriddenBy && ` by ${overrideAudit.overriddenBy}`}
          {' · '}
          {new Date(overrideAudit.overriddenAt).toLocaleString()}
          {overrideAudit.reason && (
            <p className="mt-1 whitespace-pre-wrap" style={{ color: 'var(--accent-10)' }}>{overrideAudit.reason}</p>
          )}
        </div>
      )}
    </div>
  )
}
