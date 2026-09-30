import type { JobListItem, TicketSummary } from '@/data'

export type SignalColor = 'red' | 'orange' | 'amber' | 'yellow' | 'blue' | 'green' | 'zinc'

/** What a space needs next, in one plain sentence, with at most one action. */
export interface SpaceSignal {
  summary: string
  color: SignalColor
  action?: { href: string; label: string }
}

export interface FeedItem {
  id: string
  title: string
  detail: string
  timestamp: string
  href: string
  kind: 'ticket' | 'job'
  color: SignalColor
}

export interface ProjectActivity {
  tickets: TicketSummary[]
  jobs: JobListItem[]
}
