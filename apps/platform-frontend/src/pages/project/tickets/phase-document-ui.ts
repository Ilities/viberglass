import type {
  PhaseDocumentCommentStatus,
  ApprovalState,
  PhaseDocumentRevisionResponse,
  PlanningRunResponse,
  ResearchRunResponse,
} from '@/service/api/ticket-api'

type PhaseRunStatus = ResearchRunResponse['status'] | PlanningRunResponse['status']

export function getPhaseRunStatusBadgeColor(status: PhaseRunStatus): 'amber' | 'green' | 'red' | 'zinc' {
  switch (status) {
    case 'queued':
    case 'active':
      return 'amber'
    case 'completed':
      return 'green'
    case 'failed':
      return 'red'
    default:
      return 'zinc'
  }
}

export function getApprovalStateBadgeColor(state: ApprovalState): 'zinc' | 'blue' | 'green' | 'amber' {
  switch (state) {
    case 'draft':
      return 'zinc'
    case 'approval_requested':
      return 'blue'
    case 'approved':
      return 'green'
    case 'rejected':
      return 'amber'
  }
}

export function getApprovalStateLabel(state: ApprovalState): string {
  switch (state) {
    case 'draft':
      return 'Draft'
    case 'approval_requested':
      return 'Approval Requested'
    case 'approved':
      return 'Approved'
    case 'rejected':
      return 'Rejected'
  }
}

export function formatRevisionSource(revision: Pick<PhaseDocumentRevisionResponse, 'source' | 'actor'>): string {
  if (revision.source === 'agent') {
    return 'Agent generation'
  }
  if (revision.actor) {
    return `Manual save by ${revision.actor}`
  }
  return 'Manual save'
}

export function getCommentStatusBadgeColor(status: PhaseDocumentCommentStatus): 'blue' | 'zinc' {
  return status === 'open' ? 'blue' : 'zinc'
}

export function getCommentStatusLabel(status: PhaseDocumentCommentStatus): string {
  return status === 'open' ? 'Open' : 'Resolved'
}
