import { integrationLabel } from '@/integrations/integrationLabels'
import type { TaskActivityEntry } from '@viberglass/types'
import { readableQuote } from './readable-quote'

const STEP: Record<string, string> = { planning: 'plan', execution: 'build', claw: 'scheduled run' }

/** One plain sentence per Activity entry. `nameOf` turns a user id in the payload into a name. */
export function describeActivity(entry: TaskActivityEntry, nameOf: (userId: string) => string): string {
  const who = entry.actor?.name ?? (entry.actorType === 'agent' ? 'The agent' : 'Viberglass')
  const person = typeof entry.payload.userId === 'string' ? nameOf(entry.payload.userId) : 'someone'
  // Set when the change came from the tracker issue the task is linked to.
  const tracker = typeof entry.payload.source === 'string' ? integrationLabel(entry.payload.source) : null
  const step = typeof entry.payload.step === 'string' ? (STEP[entry.payload.step] ?? entry.payload.step) : 'step'
  switch (entry.kind) {
    case 'task_created':
      return `${who} created the task`
    case 'owner_changed':
      return `${who} made ${person} the owner`
    case 'reviewer_added':
      return `${who} asked ${person} to review`
    case 'reviewer_removed':
      return `${who} took ${person} off reviewing`
    case 'watcher_added':
      return entry.actor?.id === entry.payload.userId
        ? `${who} started watching`
        : `${who} added ${person} as a watcher`
    case 'watcher_removed':
      return entry.actor?.id === entry.payload.userId
        ? `${who} stopped watching`
        : `${who} removed ${person} as a watcher`
    case 'message_posted': {
      const mentioned = Array.isArray(entry.payload.mentioned)
        ? entry.payload.mentioned.filter((id) => typeof id === 'string')
        : []
      return mentioned.length > 0
        ? `${who} wrote in the discussion and mentioned ${mentioned.map(nameOf).join(', ')}`
        : `${who} wrote in the discussion`
    }
    case 'run_started':
      return `${who} started a ${step} run`
    case 'run_finished':
      return `The ${step} run finished`
    case 'run_failed':
      return typeof entry.payload.reason === 'string'
        ? `The ${step} run failed: ${entry.payload.reason}`
        : `The ${step} run failed`
    case 'run_cancelled':
      return `${who} cancelled a run`
    case 'document_edited':
      return `${who} edited the ${step}`
    case 'document_approved':
      return `${who} approved the ${step}`
    case 'task_done':
      if (entry.payload.notPicked === true && typeof entry.payload.picked === 'string')
        return `Not picked: ${entry.payload.picked}'s pull request was merged, so this fork is done`
      return tracker ? `Closed on ${tracker}, so the task is done` : `${who} marked the task as done`
    case 'task_reopened':
      return tracker ? `Reopened on ${tracker}, so the task is open again` : `${who} reopened the task`
    case 'pull_request_merged':
      if (entry.payload.madeLive === true)
        return typeof entry.payload.mergedBy === 'string'
          ? `Made live by ${entry.payload.mergedBy}`
          : 'The change was made live'
      if (typeof entry.payload.fork === 'string')
        return typeof entry.payload.mergedBy === 'string'
          ? `${entry.payload.fork}'s pull request was merged by ${entry.payload.mergedBy}`
          : `${entry.payload.fork}'s pull request was merged`
      return typeof entry.payload.mergedBy === 'string'
        ? `Merged by ${entry.payload.mergedBy}`
        : 'The pull request was merged'
    case 'pull_request_closed':
      return 'The pull request was closed without merging'
    case 'release_live':
      return typeof entry.payload.withCommitSha === 'string'
        ? 'The change went live with a later release'
        : 'The change is live'
    case 'release_failed':
      return typeof entry.payload.reason === 'string'
        ? `The change didn't go live: ${entry.payload.reason}`
        : "The change didn't go live"
    case 'release_rolled_back':
      return typeof entry.payload.rolledBackBy === 'string'
        ? `${entry.payload.rolledBackBy} rolled the app back, taking the change out of it`
        : 'The app was rolled back, taking the change out of it'
    case 'app_data_granted':
      return typeof entry.payload.copiedAt === 'string'
        ? `${who} gave the agent's next turn a copy of the app's data from ${copyTime(entry.payload.copiedAt)}`
        : `${who} gave the agent's next turn a copy of the app's data`
    case 'app_data_grant_withdrawn':
      return `${who} withdrew the copy of the app's data before the agent used it`
    case 'part_merged': {
      const parts = Array.isArray(entry.payload.parts)
        ? entry.payload.parts.filter((part) => typeof part === 'number')
        : []
      const merged = parts.length > 0 ? `Part ${parts.join(', ')} merged` : 'A part of the plan merged'
      const by = typeof entry.payload.mergedBy === 'string' ? ` by ${entry.payload.mergedBy}` : ''
      const next = typeof entry.payload.next === 'number' ? `; part ${entry.payload.next} is next` : ''
      return `${merged}${by}${next}`
    }
    case 'part_marked': {
      const part = typeof entry.payload.part === 'number' ? `part ${entry.payload.part}` : 'a part'
      return entry.payload.mark === 'skipped'
        ? `${who} skipped ${part} of the plan`
        : `${who} marked ${part} of the plan done`
    }
    case 'part_unmarked': {
      const part = typeof entry.payload.part === 'number' ? `part ${entry.payload.part}` : 'a part'
      const reopened = entry.payload.reopened === true ? ', so the task is open again' : ''
      return `${who} took back the mark on ${part} of the plan${reopened}`
    }
    case 'build_discarded':
      return `${who} discarded the build of ${typeof entry.payload.parts === 'string' ? entry.payload.parts : 'some parts'}, which never opened its pull request`
    case 'comment_added':
      // Entries from before quotes name the line instead.
      if (typeof entry.payload.quote === 'string')
        return `${who} commented on the ${step}: “${readableQuote(entry.payload.quote)}”`
      return typeof entry.payload.line === 'number'
        ? `${who} commented on the ${step}, line ${entry.payload.line}`
        : `${who} commented on the ${step}`
    case 'comment_status_changed':
      return `${who} ${entry.payload.status === 'resolved' ? 'resolved' : 'reopened'} a comment on the ${step}`
    case 'question_asked':
      return `The agent asked ${person} a question`
    case 'question_answered':
      return `${who} answered the agent's question`
    case 'question_reminded':
      return entry.payload.escalated === true
        ? `Told ${person} the agent's question is still unanswered`
        : `Reminded ${person} of the agent's question`
    case 'agent_paused':
      return `${who} paused the agent`
    case 'agent_resumed':
      return `${who} let the agent carry on`
    case 'taken_over':
      return `${who} took the work over from the agent`
    case 'handed_back':
      return `${who} handed the work back to the agent`
  }
}

function copyTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
}
