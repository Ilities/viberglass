import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { Section } from '@/components/section'
import { TICKET_WORKFLOW_PHASE, type TicketWorkflowPhase } from '@viberglass/types'

interface TicketWorkflowPanelProps {
  workflowPhase: TicketWorkflowPhase
  isAdvancing?: boolean
  onAdvance: (phase: TicketWorkflowPhase) => Promise<void>
}

interface WorkflowPhaseDescriptor {
  phase: TicketWorkflowPhase
  title: string
  description: string
  emptyState: string
}

const workflowPhases: WorkflowPhaseDescriptor[] = [
  {
    phase: TICKET_WORKFLOW_PHASE.RESEARCH,
    title: 'Research',
    description: 'Explore the codebase and gather implementation context.',
    emptyState: 'Research artifacts will appear here in a later chunk.',
  },
  {
    phase: TICKET_WORKFLOW_PHASE.PLANNING,
    title: 'Planning',
    description: 'Define the approach before execution starts.',
    emptyState: 'Planning artifacts will appear here after research is completed.',
  },
  {
    phase: TICKET_WORKFLOW_PHASE.EXECUTION,
    title: 'Execution',
    description: 'Run the implementation workflow for this ticket.',
    emptyState: 'Execution remains unchanged in this chunk.',
  },
]

function getPhaseStatus(
  currentPhase: TicketWorkflowPhase,
  phase: TicketWorkflowPhase
): 'completed' | 'current' | 'upcoming' {
  const currentIndex = workflowPhases.findIndex((entry) => entry.phase === currentPhase)
  const phaseIndex = workflowPhases.findIndex((entry) => entry.phase === phase)

  if (phaseIndex < currentIndex) return 'completed'
  if (phaseIndex === currentIndex) return 'current'
  return 'upcoming'
}

function getStatusBadge(status: 'completed' | 'current' | 'upcoming'): {
  label: string
  color: 'green' | 'blue' | 'zinc'
} {
  if (status === 'completed') {
    return { label: 'Completed', color: 'green' }
  }

  if (status === 'current') {
    return { label: 'Current', color: 'blue' }
  }

  return { label: 'Upcoming', color: 'zinc' }
}

function getAdvanceAction(currentPhase: TicketWorkflowPhase): {
  phase: TicketWorkflowPhase
  label: string
} | null {
  if (currentPhase === TICKET_WORKFLOW_PHASE.RESEARCH) {
    return {
      phase: TICKET_WORKFLOW_PHASE.PLANNING,
      label: 'Move to Planning',
    }
  }

  if (currentPhase === TICKET_WORKFLOW_PHASE.PLANNING) {
    return {
      phase: TICKET_WORKFLOW_PHASE.EXECUTION,
      label: 'Move to Execution',
    }
  }

  return null
}

export function TicketWorkflowPanel({
  workflowPhase,
  isAdvancing = false,
  onAdvance,
}: TicketWorkflowPanelProps) {
  const advanceAction = getAdvanceAction(workflowPhase)

  return (
    <div className="app-frame rounded-lg p-6">
      <Section title="Workflow" className="mb-0">
        <div className="space-y-4">
          {workflowPhases.map((phase) => {
            const status = getPhaseStatus(workflowPhase, phase.phase)
            const badge = getStatusBadge(status)
            const isCurrent = status === 'current'
            const showAdvance = isCurrent && advanceAction !== null

            return (
              <div
                key={phase.phase}
                className="rounded-xl border border-[var(--gray-6)] bg-[var(--gray-2)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold text-[var(--gray-12)]">{phase.title}</h3>
                      <Badge color={badge.color}>{badge.label}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-[var(--gray-10)]">{phase.description}</p>
                  </div>

                  {showAdvance && advanceAction ? (
                    <Button
                      color="brand"
                      onClick={() => onAdvance(advanceAction.phase)}
                      disabled={isAdvancing}
                    >
                      {isAdvancing ? 'Updating...' : advanceAction.label}
                    </Button>
                  ) : null}
                </div>

                <p className="mt-3 text-sm text-[var(--gray-9)]">{phase.emptyState}</p>
              </div>
            )
          })}
        </div>
      </Section>
    </div>
  )
}
