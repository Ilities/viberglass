import {
  TICKET_STATUS,
  TICKET_WORKFLOW_PHASE,
  type TicketLifecycleStatus,
  type TicketWorkflowPhase,
} from '@viberglass/types'

export const ticketStatusOrder: TicketLifecycleStatus[] = [
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.RESOLVED,
]

export const ticketWorkflowPhaseOrder: TicketWorkflowPhase[] = [
  TICKET_WORKFLOW_PHASE.RESEARCH,
  TICKET_WORKFLOW_PHASE.PLANNING,
  TICKET_WORKFLOW_PHASE.EXECUTION,
]

export function formatTicketStatus(status: TicketLifecycleStatus): { label: string; className: string } {
  if (status === TICKET_STATUS.RESOLVED) {
    return {
      label: 'Resolved',
      className: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200',
    }
  }
  if (status === TICKET_STATUS.IN_PROGRESS) {
    return {
      label: 'In Progress',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
    }
  }
  return {
    label: 'Open',
    className: 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-zinc-200',
  }
}

export function formatTicketWorkflowPhase(phase: TicketWorkflowPhase): { label: string; className: string } {
  if (phase === TICKET_WORKFLOW_PHASE.RESEARCH) {
    return {
      label: 'Research',
      className: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
    }
  }
  if (phase === TICKET_WORKFLOW_PHASE.PLANNING) {
    return {
      label: 'Planning',
      className: 'bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200',
    }
  }
  return {
    label: 'Execution',
    className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-500/20 dark:text-cyan-200',
  }
}
