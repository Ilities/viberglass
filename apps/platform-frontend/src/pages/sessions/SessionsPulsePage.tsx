import { Badge } from '@/components/badge'
import { Heading } from '@/components/heading'
import { Link } from '@/components/link'
import { SegmentedControl } from '@/components/segmented-control'
import { usePolling } from '@/hooks/usePolling'
import { getSeverityBadge } from '@/pages/project/tickets/ticket-display'
import { getProjects, type Project } from '@/service/api/project-api'
import { getTickets } from '@/service/api/ticket-api'
import type { Ticket } from '@viberglass/types'
import { useCallback, useEffect, useState } from 'react'

type GroupBy = 'status' | 'phase'

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function phaseBadge(phase: string): { label: string; color: 'amber' | 'violet' | 'cyan' } {
  switch (phase) {
    case 'research':  return { label: 'Research',  color: 'amber'  }
    case 'planning':  return { label: 'Planning',  color: 'violet' }
    case 'execution': return { label: 'Execution', color: 'cyan'   }
    default:          return { label: phase,        color: 'amber'  }
  }
}

function statusBadge(status: string): { label: string; color: 'amber' | 'blue' } {
  return status === 'in_review'
    ? { label: 'Needs Review', color: 'amber' }
    : { label: 'In Progress',  color: 'blue'  }
}

function TicketRow({
  ticket,
  projectSlug,
  groupBy,
}: {
  ticket: Ticket
  projectSlug: string
  groupBy: GroupBy
}) {
  const severity = getSeverityBadge(ticket.severity)
  const phase    = phaseBadge(ticket.workflowPhase)
  const status   = statusBadge(ticket.status)
  // When grouped by phase, show status badge; when grouped by status, show phase badge
  const contextBadge = groupBy === 'phase' ? status : phase

  return (
    <Link
      href={`/project/${projectSlug}/tickets/${ticket.id}`}
      className="group flex items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
    >
      <span
        className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${
          ticket.status === 'in_review' ? 'bg-amber-400' : 'bg-blue-400'
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900 group-hover:text-zinc-950 dark:text-zinc-100 dark:group-hover:text-white">
          {ticket.title}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{projectSlug}</span>
          <Badge color={contextBadge.color} className="py-0 text-[10px]">{contextBadge.label}</Badge>
          <Badge color={severity.color} className="py-0 text-[10px]">{severity.label}</Badge>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">{formatRelativeTime(ticket.updatedAt)}</span>
        </div>
      </div>
    </Link>
  )
}

function Section({
  title,
  tickets,
  slugById,
  groupBy,
  accent,
}: {
  title: string
  tickets: Ticket[]
  slugById: Map<string, string>
  groupBy: GroupBy
  accent: 'amber' | 'violet' | 'cyan' | 'blue'
}) {
  if (tickets.length === 0) return null

  const accentBar: Record<string, string> = {
    amber:  'bg-amber-400  dark:bg-amber-500',
    violet: 'bg-violet-400 dark:bg-violet-500',
    cyan:   'bg-cyan-400   dark:bg-cyan-500',
    blue:   'bg-blue-400   dark:bg-blue-500',
  }
  const countColor: Record<string, string> = {
    amber:  'bg-amber-100  text-amber-700  dark:bg-amber-900/40  dark:text-amber-400',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
    cyan:   'bg-cyan-100   text-cyan-700   dark:bg-cyan-900/40   dark:text-cyan-400',
    blue:   'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-400',
  }

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-700/60">
      <div className="flex items-center gap-3 border-b border-zinc-100 px-4 py-3 dark:border-zinc-700/60">
        <span className={`h-3.5 w-1 shrink-0 rounded-full ${accentBar[accent]}`} />
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{title}</span>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium tabular-nums ${countColor[accent]}`}>
          {tickets.length}
        </span>
      </div>
      <div className="p-1">
        {tickets.map((ticket) => {
          const slug = slugById.get(ticket.projectId)
          if (!slug) return null
          return <TicketRow key={ticket.id} ticket={ticket} projectSlug={slug} groupBy={groupBy} />
        })}
      </div>
    </div>
  )
}

function GroupedByStatus({ tickets, slugById }: { tickets: Ticket[]; slugById: Map<string, string> }) {
  const inReview   = tickets.filter((t) => t.status === 'in_review')
  const inProgress = tickets.filter((t) => t.status === 'in_progress')
  return (
    <div className="flex flex-col gap-4">
      <Section title="Needs Review" tickets={inReview}   slugById={slugById} groupBy="status" accent="amber" />
      <Section title="In Progress"  tickets={inProgress} slugById={slugById} groupBy="status" accent="blue"  />
    </div>
  )
}

function GroupedByPhase({ tickets, slugById }: { tickets: Ticket[]; slugById: Map<string, string> }) {
  const research  = tickets.filter((t) => t.workflowPhase === 'research')
  const planning  = tickets.filter((t) => t.workflowPhase === 'planning')
  const execution = tickets.filter((t) => t.workflowPhase === 'execution')
  return (
    <div className="flex flex-col gap-4">
      <Section title="Research"  tickets={research}  slugById={slugById} groupBy="phase" accent="amber"  />
      <Section title="Planning"  tickets={planning}  slugById={slugById} groupBy="phase" accent="violet" />
      <Section title="Execution" tickets={execution} slugById={slugById} groupBy="phase" accent="cyan"   />
    </div>
  )
}

export function SessionsPulsePage() {
  const [projects, setProjects]   = useState<Project[]>([])
  const [groupBy, setGroupBy]     = useState<GroupBy>('status')

  useEffect(() => {
    getProjects().then(setProjects).catch(console.error)
  }, [])

  const fn = useCallback(
    () => getTickets({ statuses: ['in_review', 'in_progress'], limit: 50 }),
    [],
  )

  const { data: ticketList, isPolling } = usePolling({ fn, interval: 15000 })

  const allTickets = ticketList?.tickets ?? []
  const slugById   = new Map(projects.map((p) => [p.id, p.slug]))
  const loaded     = ticketList !== null

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-baseline sm:justify-between">
        <div className="flex items-baseline gap-3">
          <Heading>Action Required</Heading>
          {isPolling && (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Refreshing…</span>
          )}
        </div>
        <SegmentedControl
          value={groupBy}
          onChange={(v) => setGroupBy(v as GroupBy)}
          options={[
            { value: 'status', label: 'By Status' },
            { value: 'phase',  label: 'By Phase'  },
          ]}
        />
      </div>

      {loaded && allTickets.length === 0 && (
        <div className="mt-16 flex flex-col items-center gap-1 text-center">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">All clear</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Tickets needing review or in progress will appear here.
          </p>
        </div>
      )}

      {allTickets.length > 0 && (
        <div className="mt-6">
          {groupBy === 'status'
            ? <GroupedByStatus tickets={allTickets} slugById={slugById} />
            : <GroupedByPhase  tickets={allTickets} slugById={slugById} />
          }
        </div>
      )}
    </div>
  )
}
