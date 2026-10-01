import type { TaskActivityEntry } from '@viberglass/types'
import { readableQuote } from './readable-quote'

const STEP: Record<string, string> = { research: 'research', planning: 'plan', execution: 'build', claw: 'scheduled run' }

/** One plain sentence per Activity entry. `nameOf` turns a user id in the payload into a name. */
export function describeActivity(entry: TaskActivityEntry, nameOf: (userId: string) => string): string {
  const who = entry.actor?.name ?? (entry.actorType === 'agent' ? 'The agent' : 'Viberglass')
  const person = typeof entry.payload.userId === 'string' ? nameOf(entry.payload.userId) : 'someone'
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
      return entry.actor?.id === entry.payload.userId ? `${who} started watching` : `${who} added ${person} as a watcher`
    case 'watcher_removed':
      return entry.actor?.id === entry.payload.userId ? `${who} stopped watching` : `${who} removed ${person} as a watcher`
    case 'message_posted': {
      const mentioned = Array.isArray(entry.payload.mentioned) ? entry.payload.mentioned.filter((id) => typeof id === 'string') : []
      return mentioned.length > 0
        ? `${who} wrote in the discussion and mentioned ${mentioned.map(nameOf).join(', ')}`
        : `${who} wrote in the discussion`
    }
    case 'run_started':
      return `${who} started a ${step} run`
    case 'run_finished':
      return `The ${step} run finished`
    case 'run_failed':
      return typeof entry.payload.reason === 'string' ? `The ${step} run failed: ${entry.payload.reason}` : `The ${step} run failed`
    case 'run_cancelled':
      return `${who} cancelled a run`
    case 'document_edited':
      return `${who} edited the ${step}`
    case 'document_approved':
      return `${who} approved the ${step}`
    case 'task_done':
      return `${who} marked the task as done`
    case 'comment_added':
      // Entries from before quotes name the line instead.
      if (typeof entry.payload.quote === 'string') return `${who} commented on the ${step}: “${readableQuote(entry.payload.quote)}”`
      return typeof entry.payload.line === 'number' ? `${who} commented on the ${step}, line ${entry.payload.line}` : `${who} commented on the ${step}`
  }
}
