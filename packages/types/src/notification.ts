/** What can land in someone's Inbox (plan §8). Agent questions and expiry warnings come with Phase 3. */
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

/** The Inbox groups of J10, in the order they're shown. */
export const INBOX_GROUPS = ['questions', 'reviews', 'mentions', 'failures', 'updates'] as const

export type InboxGroup = (typeof INBOX_GROUPS)[number]

export const INBOX_GROUP_OF: Record<NotificationKind, InboxGroup> = {
  review_requested: 'reviews',
  mentioned: 'mentions',
  task_assigned: 'updates',
  step_completed: 'updates',
  run_failed_setup: 'failures',
  run_failed_agent: 'failures',
  task_done: 'updates',
}

export function isNotificationKind(value: string): value is NotificationKind {
  return NOTIFICATION_KINDS.some((kind) => kind === value)
}

export interface InboxItem {
  id: string
  kind: NotificationKind
  group: InboxGroup
  /** One sentence, the same in the Inbox, Slack and email. */
  text: string
  task: { id: string; key: string; title: string; spaceSlug: string } | null
  actor: { id: string; name: string } | null
  createdAt: string
  readAt: string | null
  doneAt: string | null
  snoozedUntil: string | null
}

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
      return `${who} marked “${taskTitle}” as done`
  }
}

/** J10's My tasks: the tasks someone asked for, owns or reviews, by whose move it is. */
export const MY_TASK_GROUPS = ['waiting_on_me', 'agent_working', 'waiting_on_others', 'done'] as const

export type MyTaskGroup = (typeof MY_TASK_GROUPS)[number]

export interface MyTask {
  id: string
  key: string
  title: string
  spaceSlug: string
  group: MyTaskGroup
  /** The caller's roles on the task. */
  roles: Array<'requester' | 'owner' | 'reviewer' | 'watcher'>
  updatedAt: string
}

/**
 * Whose move a task is, for one person: done; the agent's while a run is on;
 * theirs when it awaits review and they own or review it, or it's open and
 * they own it; otherwise someone else's.
 */
export function myTaskGroup(status: 'open' | 'in_progress' | 'in_review' | 'resolved', roles: string[]): MyTaskGroup {
  if (status === 'resolved') return 'done'
  if (status === 'in_progress') return 'agent_working'
  const owns = roles.includes('owner')
  if (status === 'in_review' && (owns || roles.includes('reviewer'))) return 'waiting_on_me'
  if (status === 'open' && owns) return 'waiting_on_me'
  return 'waiting_on_others'
}
