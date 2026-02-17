import type { JobListItem, TicketSummary } from '@/data'

export type SignalColor = 'red' | 'orange' | 'amber' | 'blue' | 'green' | 'zinc'

export interface ProjectSignal {
  label: string
  color: SignalColor
  blurb: string
  glyph: string
  nextHref: string
  nextLabel: string
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
