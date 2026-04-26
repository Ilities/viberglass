import { Badge } from '@/components/badge'
import { Heading, Subheading } from '@/components/heading'
import { Link } from '@/components/link'
import { usePolling } from '@/hooks/usePolling'
import { listAllActiveSessions, type AgentSession, type AgentSessionStatus } from '@/service/api/session-api'
import { useCallback } from 'react'

function statusBadge(status: AgentSessionStatus): {
  label: string
  color: 'green' | 'amber' | 'blue' | 'red' | 'zinc'
} {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'blue' }
    case 'waiting_on_user':
      return { label: 'Waiting on you', color: 'amber' }
    case 'waiting_on_approval':
      return { label: 'Needs approval', color: 'amber' }
    case 'completed':
      return { label: 'Completed', color: 'green' }
    case 'failed':
      return { label: 'Failed', color: 'red' }
    case 'cancelled':
      return { label: 'Cancelled', color: 'zinc' }
    default:
      return { label: status, color: 'zinc' }
  }
}

function modeBadge(mode: string): { label: string; color: 'violet' | 'blue' | 'amber' } {
  switch (mode) {
    case 'research':
      return { label: 'Research', color: 'violet' }
    case 'planning':
      return { label: 'Planning', color: 'blue' }
    case 'execution':
      return { label: 'Execution', color: 'amber' }
    default:
      return { label: mode, color: 'blue' }
  }
}

function LiveDot({ status }: { status: AgentSessionStatus }) {
  if (status !== 'active') return null
  return <span className="inline-block h-2 w-2 rounded-full bg-green-500 shrink-0" />
}

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

function SessionCard({ session }: { session: AgentSession }) {
  const slug = session.projectSlug
  if (!slug) return null

  const sb = statusBadge(session.status)
  const mb = modeBadge(session.mode)

  return (
    <Link
      href={`/project/${slug}/sessions/${session.id}`}
      className="flex items-start gap-3 rounded-lg border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-800/50"
    >
      <LiveDot status={session.status} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
            {session.ticketTitle ?? 'Session'}
          </span>
          <Badge color={mb.color}>{mb.label}</Badge>
          <Badge color={sb.color}>{sb.label}</Badge>
        </div>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          Updated {formatRelativeTime(session.updatedAt)}
        </p>
      </div>
    </Link>
  )
}

function groupByProject(sessions: AgentSession[]): Map<string, AgentSession[]> {
  const map = new Map<string, AgentSession[]>()
  for (const session of sessions) {
    const slug = session.projectSlug ?? 'unknown'
    const existing = map.get(slug) ?? []
    existing.push(session)
    map.set(slug, existing)
  }
  return map
}

export function SessionsPulsePage() {
  const fn = useCallback(() => listAllActiveSessions(), [])

  const { data: sessions, isPolling } = usePolling<AgentSession[]>({
    fn,
    interval: 15000,
  })

  const allSessions = sessions ?? []
  const grouped = groupByProject(allSessions)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <Heading>Live Sessions</Heading>
        {isPolling && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Refreshing…</span>
        )}
      </div>

      {allSessions.length === 0 && sessions !== null && (
        <div className="mt-12 flex flex-col items-center gap-2 text-center">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            No active sessions across any project
          </p>
          <p className="text-xs text-zinc-400 dark:text-zinc-500">
            Sessions will appear here when agents are running.
          </p>
        </div>
      )}

      {grouped.size > 0 && (
        <div className="mt-6 space-y-8">
          {Array.from(grouped.entries()).map(([slug, projectSessions]) => (
            <section key={slug}>
              <Subheading className="mb-3">{slug}</Subheading>
              <div className="space-y-2">
                {projectSessions.map((session) => (
                  <SessionCard key={session.id} session={session} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
