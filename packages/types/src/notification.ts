/** What people are told by chat and email. In the app, Home's Needs you and unread counts are the notifications. */
export const NOTIFICATION_KINDS = [
  'review_requested',
  'mentioned',
  'task_assigned',
  'step_completed',
  'run_failed_setup',
  'run_failed_agent',
  'task_done',
  /** A pull request for some of the plan's parts merged, and the next part can be built. */
  'part_merged',
  'question_asked',
  'question_reminder',
  'credential_expiring',
] as const

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]

const STEP_NOUN: Record<string, string> = { planning: 'plan', execution: 'build' }

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
    case 'question_asked':
      return `The agent has a question for you on “${taskTitle}”${typeof payload.question === 'string' ? `: ${payload.question}` : ''}`
    case 'question_reminder':
      // The owner hears when the person asked hasn't answered; the person asked is reminded.
      return payload.escalated === true
        ? `The agent's question on “${taskTitle}” is still unanswered${typeof payload.askedOfName === 'string' ? ` by ${payload.askedOfName}` : ''}`
        : `The agent is still waiting for your answer on “${taskTitle}”${typeof payload.question === 'string' ? `: ${payload.question}` : ''}`
    case 'credential_expiring':
      return `The ${typeof payload.credential === 'string' ? `“${payload.credential}” ` : ''}credential for ${typeof payload.connection === 'string' ? payload.connection : 'a connection'} expires on ${typeof payload.expiresOn === 'string' ? payload.expiresOn : 'soon'}. Replace it before then, or runs that use it will stop.`
    case 'task_done':
      if (payload.merged === true) {
        return typeof payload.mergedBy === 'string'
          ? `“${taskTitle}” is done: ${payload.mergedBy} merged its pull request`
          : `“${taskTitle}” is done: its pull request was merged`
      }
      return `${who} marked “${taskTitle}” as done`
    case 'part_merged': {
      const merged = Array.isArray(payload.parts) && payload.parts.length > 0 ? `Part ${payload.parts.join(', ')}` : 'A part'
      const next = typeof payload.next === 'number' ? `; part ${payload.next} can be built now` : ''
      return `${merged} of “${taskTitle}” is merged${next}`
    }
  }
}

/** A chat service a person can be told things on, by direct message. */
export interface ChatNotificationChannel {
  /** The chat integration's id. */
  system: string
  label: string
  /** The service is set up on this installation. */
  available: boolean
  /** The person linked their account on it. */
  linked: boolean
}

/** Where the signed-in person can be told things. */
export interface NotificationChannels {
  chat: ChatNotificationChannel[]
  emailAvailable: boolean
}
