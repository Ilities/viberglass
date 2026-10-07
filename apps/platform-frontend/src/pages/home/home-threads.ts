import type { HomeThread, TaskSituation } from '@viberglass/types'

export const HOME_FILTERS = ['all', 'unread', 'mine'] as const

export type HomeFilter = (typeof HOME_FILTERS)[number]

export const HOME_FILTER_LABEL: Record<HomeFilter, string> = { all: 'All', unread: 'Unread', mine: 'I own' }

/** Narrows the threads: unread ones, or the ones you own. */
export function filterThreads(threads: HomeThread[], filter: HomeFilter): HomeThread[] {
  if (filter === 'unread') return threads.filter((thread) => thread.unread > 0)
  if (filter === 'mine') return threads.filter((thread) => thread.roles.includes('owner'))
  return threads
}

/** "Tomi: does the warehouse template have room…", the thread's last word. */
export function lastMessageLine(message: HomeThread['lastMessage'] | undefined): string | null {
  if (!message) return null
  return message.author ? `${message.author.name}: ${message.text}` : message.text
}

/** Viewers have no threads of their own, so they land on Overview; everyone else on Home. */
export function landingFor(role: string | undefined): '/' | '/overview' {
  return role === 'viewer' ? '/overview' : '/'
}

/** "Quinn's turn", "Agent working": whose move the task is, in the words a row uses. Null when it's nobody's. */
export function turnLine(situation: TaskSituation): string | null {
  if (situation.waitingOn.kind === 'agent') return situation.state === 'agent_working' ? null : 'Agent working'
  if (situation.waitingOn.kind !== 'people' || situation.waitingOn.people.length === 0) return null
  const names = situation.waitingOn.people.map((person) => person.name.split(' ')[0])
  const who = names.length < 3 ? names.join(' and ') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
  return `${who}'s turn`
}

/** Whether the agent is what needs you: it asked, or it finished something for you to review. */
export function agentNeedsYou(thread: HomeThread): boolean {
  return thread.situation.state === 'question' || (thread.situation.state === 'artifact_ready' && thread.mentionsYou)
}

/** Why a thread needs you, as its row's badge: the agent asked, something is ready for review, someone mentioned you, or it's your move. */
export function needsYouReason(thread: HomeThread): string {
  if (thread.situation.state === 'question') return 'Agent asked you'
  // Nobody wrote after the artifact, so the mention is the agent's own, asking for review.
  if (thread.situation.state === 'artifact_ready' && thread.mentionsYou) return 'Ready for your review'
  if (thread.mentionsYou) return thread.lastMessage?.author ? `${thread.lastMessage.author.name.split(' ')[0]} mentioned you` : 'You were mentioned'
  return 'Your move'
}

/** "“Can we use business days…”", the last word quoted, for a row's line. */
export function quotedLastMessage(message: HomeThread['lastMessage'] | undefined): string | null {
  return message ? `“${message.text}”` : null
}

/** "Good morning", by the hour where you are. */
export function greeting(now: Date): string {
  const hour = now.getHours()
  if (hour < 5) return 'Good evening'
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

/** The line under Home's greeting: how many conversations need you. */
export function attentionLine(needingYou: number): string {
  if (needingYou === 0) return 'Your conversations and next moves, in one place.'
  return needingYou === 1 ? 'One conversation needs your attention.' : `${needingYou} conversations need your attention.`
}
