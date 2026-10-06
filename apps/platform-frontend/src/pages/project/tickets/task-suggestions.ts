import { buildPartsMessage, nextBuild, type JobFailure, type PartRange, type TaskCapabilities, type TaskPlanParts, type TaskTurnAction, type Ticket } from '@viberglass/types'

/** A common next move, offered above the composer; pressing it posts the label and asks the agent. */
export interface TaskSuggestion {
  action: TaskTurnAction
  label: string
  /** The agent to ask; none means whichever the task's next ask goes to. */
  agentId?: string
  /** For a build: the plan's parts it builds, in a pull request of its own. */
  parts?: PartRange
}

export interface TaskSuggestionInput {
  ticket: Pick<Ticket, 'status'>
  plan: { content: string }
  /** What the person may ask for; null when it couldn't be loaded, so nothing is offered. */
  capabilities: TaskCapabilities | null
  /** Open comments on the plan made since its latest version, which the agent hasn't revised it with. */
  newComments: number
  /** The agent's latest turn on the task, if any. */
  latestTurn: { action: TaskTurnAction; status: string; agent?: { id: string; name: string } } | null
  agentWorking: boolean
  /** Why the latest run failed; a setup failure fails again until someone fixes the setup. */
  lastFailure?: Pick<JobFailure, 'category' | 'retryable'> | null
  /** How much the thread has grown since its latest summary, or since it began. */
  sinceSummary?: { finishedTurns: number; messages: number }
  /** The plan part by part; without it, a build is offered for the whole plan. */
  planParts?: TaskPlanParts | null
}

/** When the thread has grown enough that a summary helps people and the next agent. */
const SUMMARY_AFTER = { finishedTurns: 3, messages: 10 }

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? '' : 's'}`

/** Open comments made since the document's latest version; older ones went to the agent with an earlier ask. */
export function countNewComments(comments: Array<{ status: string; createdAt: string }>, documentUpdatedAt: string): number {
  return comments.filter((comment) => comment.status === 'open' && comment.createdAt > documentUpdatedAt).length
}

/**
 * What to offer next: try a failed turn again, revise with open comments, write
 * what's missing, summarise a thread that has grown, and build, for whoever may
 * ask for code. Nothing has to be approved first: a task can go straight to code.
 */
export function suggestTaskActions({
  ticket,
  plan,
  capabilities,
  newComments,
  latestTurn,
  agentWorking,
  lastFailure,
  sinceSummary,
  planParts,
}: TaskSuggestionInput): TaskSuggestion[] {
  if (agentWorking || ticket.status === 'resolved' || !capabilities?.canAsk) return []
  const suggestions: TaskSuggestion[] = []
  const needsSetupFix = lastFailure?.category === 'setup' && !lastFailure.retryable
  if (latestTurn?.status === 'failed' && !needsSetupFix && (latestTurn.action !== 'code' || capabilities.canAskForCode)) {
    // The same agent again: another one may be next on the task, and that isn't what "again" means.
    suggestions.push(
      latestTurn.agent
        ? { action: latestTurn.action, label: `Try again with ${latestTurn.agent.name}`, agentId: latestTurn.agent.id }
        : { action: latestTurn.action, label: 'Try again' }
    )
  }

  const hasPlan = plan.content.trim().length > 0
  if (!hasPlan) suggestions.push({ action: 'plan', label: 'Write the plan' })
  if (hasPlan && newComments > 0) {
    suggestions.push({ action: 'plan', label: `Revise the plan with ${plural(newComments, 'comment')}` })
  }
  if (sinceSummary && (sinceSummary.finishedTurns >= SUMMARY_AFTER.finishedTurns || sinceSummary.messages >= SUMMARY_AFTER.messages)) {
    suggestions.push({ action: 'summarise', label: 'Summarise so far' })
  }
  if (capabilities.canAskForCode) suggestions.push(...buildSuggestions(planParts ?? null))
  return suggestions
}

/**
 * The builds to offer: a plan in parts builds its next part, or everything
 * left in one pull request, once the earlier parts are merged; a plan in one
 * part, or none, is built as a whole.
 */
export function buildSuggestions(planParts: TaskPlanParts | null): TaskSuggestion[] {
  const next = planParts ? nextBuild(planParts) : { label: 'Build it' }
  if (!next) return []
  const offered: TaskSuggestion[] = [{ action: 'code', label: next.label, ...(next.parts ? { parts: next.parts } : {}) }]
  const left = planParts?.parts.filter((part) => part.status === 'not_built') ?? []
  if (next.parts && left.length > 1) {
    const rest = { first: next.parts.first, last: null }
    offered.push({ action: 'code', label: buildPartsMessage(rest), parts: rest })
  }
  return offered
}
