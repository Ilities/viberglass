/** What people are told by Slack and email (plan §8). In the app, Home's Needs you and unread counts are the notifications. */
export const NOTIFICATION_KINDS = [
  'review_requested',
  'mentioned',
  'task_assigned',
  'step_completed',
  'run_failed_setup',
  'run_failed_agent',
  'task_done',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

const STEP_NOUN: Record<string, string> = { research: 'research', planning: 'plan', execution: 'build' }

/** The sentence for a notification. `payload.step` names the step where it matters. */
export function notificationText(kind: NotificationKind, actorName: string | null, taskTitle: string, payload: Record<string, unknown>): string {
  const who = actorName ?? 'Someone'
  const step = typeof payload.step === 'string' ? (STEP_NOUN[payload.step] ?? payload.step) : 'step'
  switch (kind) {
    case 'review_requested':
      return actorName ? `${who} asked you to review “${taskTitle}”` : `The ${step} for “${taskTitle}” is ready for your review`
    case 'mentioned':
      // With no person acting, it's the agent asking people to look at what it produced.
      return actorName ? `${who} mentioned you on “${taskTitle}”` : `The agent mentioned you on “${taskTitle}”: the ${step} is ready`
    case 'task_assigned':
      return `${who} made you the owner of “${taskTitle}”`
    case 'step_completed':
      return `The ${step} for “${taskTitle}” is ready`
    case 'run_failed_setup':
      return `A ${step} run on “${taskTitle}” failed and needs an admin${typeof payload.reason === 'string' ? `: ${payload.reason}` : ''}`
    case 'run_failed_agent':
      return `The ${step} run on “${taskTitle}” failed${typeof payload.reason === 'string' ? `: ${payload.reason}` : ''}`
    case 'task_done':
      if (payload.merged === true) {
        return typeof payload.mergedBy === 'string'
          ? `“${taskTitle}” is done: ${payload.mergedBy} merged its pull request`
          : `“${taskTitle}” is done: its pull request was merged`
      }
      return `${who} marked “${taskTitle}” as done`
  }
}
