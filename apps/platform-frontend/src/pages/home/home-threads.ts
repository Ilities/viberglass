import type { HomeThread } from '@viberglass/types'

export const HOME_FILTERS = ['all', 'unread', 'mine'] as const

export type HomeFilter = (typeof HOME_FILTERS)[number]

export const HOME_FILTER_LABEL: Record<HomeFilter, string> = { all: 'All', unread: 'Unread', mine: 'Mine' }

/** Narrows the threads: unread ones, or the ones you own. */
export function filterThreads(threads: HomeThread[], filter: HomeFilter): HomeThread[] {
  if (filter === 'unread') return threads.filter((thread) => thread.unread > 0)
  if (filter === 'mine') return threads.filter((thread) => thread.roles.includes('owner'))
  return threads
}

/** "Tomi: does the warehouse template have room…", the thread's last word. */
export function lastMessageLine(thread: HomeThread): string | null {
  const message = thread.lastMessage
  if (!message) return null
  return message.author ? `${message.author.name}: ${message.text}` : message.text
}

/** Viewers have no threads of their own, so they land on Overview (J13); everyone else on Home. */
export function landingFor(role: string | undefined): '/' | '/overview' {
  return role === 'viewer' ? '/overview' : '/'
}
