import type { TaskTurnAction, Ticket } from '@viberglass/types'
import type { ApprovalState } from '@/service/api/ticket-api'

/** A common next move, offered above the composer; pressing it posts the label and asks the agent (ADR 0008). */
export interface TaskSuggestion {
  action: TaskTurnAction
  label: string
}

export interface TaskSuggestionInput {
  ticket: Pick<Ticket, 'status' | 'workflowOverriddenAt'>
  documents: Record<'research' | 'planning', { content: string; approvalState: ApprovalState }>
  /** Open comments on each document made since its latest version, which the agent hasn't revised it with. */
  newComments: Record<'research' | 'planning', number>
  /** The agent's latest turn on the task, if any. */
  latestTurn: { action: TaskTurnAction; status: string } | null
  agentWorking: boolean
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Open comments made since the document's latest version; older ones went to the agent with an earlier ask. */
export function countNewComments(comments: Array<{ status: string; createdAt: string }>, documentUpdatedAt: string): number {
  return comments.filter((comment) => comment.status === 'open' && comment.createdAt > documentUpdatedAt).length
}

/** What to offer next: try a failed turn again, revise with open comments, write what's missing, build once the plan allows it. */
export function suggestTaskActions({ ticket, documents, newComments, latestTurn, agentWorking }: TaskSuggestionInput): TaskSuggestion[] {
  if (agentWorking || ticket.status === 'resolved') return []
  const suggestions: TaskSuggestion[] = []
  if (latestTurn?.status === 'failed') suggestions.push({ action: latestTurn.action, label: 'Try again' })

  const hasResearch = documents.research.content.trim().length > 0
  const hasPlan = documents.planning.content.trim().length > 0
  if (!hasResearch && !hasPlan) suggestions.push({ action: 'research', label: 'Write the research' })
  if (hasResearch && newComments.research > 0) {
    suggestions.push({ action: 'research', label: `Revise the research with ${plural(newComments.research, 'comment')}` })
  }
  if (!hasPlan) suggestions.push({ action: 'plan', label: 'Write the plan' })
  if (hasPlan && newComments.planning > 0) {
    suggestions.push({ action: 'plan', label: `Revise the plan with ${plural(newComments.planning, 'comment')}` })
  }
  // Until the gates go (S3), a build waits for the plan's approval, or a skip to the build.
  if (hasPlan && (documents.planning.approvalState === 'approved' || ticket.workflowOverriddenAt)) {
    suggestions.push({ action: 'code', label: 'Build it' })
  }
  return suggestions
}
