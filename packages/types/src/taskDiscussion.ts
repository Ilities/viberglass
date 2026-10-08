/**
 * A mention inside a message body: `@[Maria PM](user:<id>)` for a person,
 * `@[Claude](agent:<clankerId>)` for an agent. The composer writes it; the
 * server reads the ids, so names can change without breaking it.
 */
const MENTION = /@\[([^\]\n]{1,100})\]\((user|agent):([0-9a-f-]{36})\)/g

export type MentionKind = 'user' | 'agent'

function token(kind: MentionKind, name: string, id: string): string {
  return `@[${name.replace(/[\]\n]/g, '')}](${kind}:${id})`
}

export function mentionToken(name: string, userId: string): string {
  return token('user', name, userId)
}

export function agentMentionToken(name: string, clankerId: string): string {
  return token('agent', name, clankerId)
}

function mentionedIds(body: string, kind: MentionKind): string[] {
  return [...new Set([...body.matchAll(MENTION)].filter((match) => match[2] === kind).map((match) => match[3]))]
}

/** The people mentioned in a message, each once. */
export function parseMentionedUserIds(body: string): string[] {
  return mentionedIds(body, 'user')
}

/** The agents mentioned in a message, each once, in the order they appear. */
export function parseMentionedAgentIds(body: string): string[] {
  return mentionedIds(body, 'agent')
}

/** "@agent" written out rather than picked: the agent already on the task, or the default one. */
const ANY_AGENT = /(^|\s)@agent\b/i

/** Whether a message asks an agent: it mentions one, or "@agent". */
export function mentionsAnAgent(body: string): boolean {
  return parseMentionedAgentIds(body).length > 0 || ANY_AGENT.test(body)
}

/** The message split into text and mentions, for rendering. */
export function splitMentions(body: string): Array<{ text: string } | { mention: { name: string; kind: MentionKind; id: string } }> {
  const parts: Array<{ text: string } | { mention: { name: string; kind: MentionKind; id: string } }> = []
  let last = 0
  for (const match of body.matchAll(MENTION)) {
    const index = match.index ?? 0
    if (index > last) parts.push({ text: body.slice(last, index) })
    parts.push({ mention: { name: match[1], kind: match[2] === 'agent' ? 'agent' : 'user', id: match[3] } })
    last = index + match[0].length
  }
  if (last < body.length) parts.push({ text: body.slice(last) })
  return parts
}

/** The message as the agent reads it: each mention as plain "@Name". */
export function withPlainMentions(body: string): string {
  return body.replace(MENTION, (_match, name: string) => `@${name}`)
}

/** Someone without a Viberglass account who wrote in a linked tracker issue: "Pat" on Jira. */
export interface ExternalMessageAuthor {
  name: string
  source: string
}

export interface TaskMessage {
  id: string
  ticketId: string
  author: { id: string; name: string } | null
  /** Set when the writer has no Viberglass account; `author` is null then. */
  externalAuthor: ExternalMessageAuthor | null
  /** The tracker it was written in ("jira", "shortcut", "github"), or null when written in Viberglass or Slack. */
  source: string | null
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
  /** A document comment resolved or reopened; the thread shows it on the comment. */
  'comment_status_changed',
  'task_done',
  'pull_request_merged',
  /** A pull request for some of the plan's parts merged, with more parts to build. */
  'part_merged',
  /** Someone marked a part done or skipped, or took the mark back. */
  'part_marked',
  'part_unmarked',
  /** Someone discarded a build of some parts that never opened its pull request. */
  'build_discarded',
  'question_asked',
  'question_answered',
  'question_reminded',
  'agent_paused',
  'agent_resumed',
  'taken_over',
  'handed_back',
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
