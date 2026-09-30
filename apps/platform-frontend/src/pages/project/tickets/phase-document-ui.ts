import type { PhaseDocumentRevisionResponse } from '@/service/api/ticket-api'

export function formatRevisionSource(revision: Pick<PhaseDocumentRevisionResponse, 'source' | 'actor'>): string {
  if (revision.source === 'agent') {
    return 'Agent generation'
  }
  if (revision.actor) {
    return `Manual save by ${revision.actor}`
  }
  return 'Manual save'
}
