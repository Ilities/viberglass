/**
 * A mention inside a message body: `@[Maria PM](user:<id>)`. The composer
 * writes it; the server reads the ids, so names can change without breaking it.
 */
const MENTION = /@\[([^\]\n]{1,100})\]\(user:([0-9a-f-]{36})\)/g

export function mentionToken(name: string, userId: string): string {
  return `@[${name.replace(/[\]\n]/g, '')}](user:${userId})`
}

/** The ids mentioned in a message, each once. */
export function parseMentionedUserIds(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION)].map((match) => match[2]))]
}

/** The message split into text and mentions, for rendering. */
export function splitMentions(body: string): Array<{ text: string } | { mention: { name: string; userId: string } }> {
  const parts: Array<{ text: string } | { mention: { name: string; userId: string } }> = []
  let last = 0
  for (const match of body.matchAll(MENTION)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: body.slice(last, index) })
    parts.push({ mention: { name: match[1], userId: match[2] } })
    last = index + match[0].length
  }
  if (last < body.length) parts.push({ text: body.slice(last) })
  return parts
}

export interface TaskMessage {
  id: string
  ticketId: string
  author: { id: string; name: string } | null
  body: string
  createdAt: string
  editedAt: string | null
}

export const TASK_ACTIVITY_KINDS = [
  'task_created',
  'owner_changed',
  'reviewer_added',
  'reviewer_removed',
  'watcher_added',
  'watcher_removed',
  'message_posted',
  'run_started',
  'run_finished',
  'run_failed',
  'run_cancelled',
  'document_edited',
  'document_approved',
  'comment_added',
  'task_done',
] as const

export type TaskActivityKind = (typeof TASK_ACTIVITY_KINDS)[number]

export type TaskActivityActorType = 'human' | 'agent' | 'system'

export interface TaskActivityEntry {
  id: string
  ticketId: string
  actorType: TaskActivityActorType
  actor: { id: string; name: string } | null
  kind: TaskActivityKind
  payload: Record<string, unknown>
  createdAt: string
}
