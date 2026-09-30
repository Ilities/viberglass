import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { Link } from '@/components/link'
import { Timestamp } from '@/components/timestamp'
import { formatJobStatus } from '@/data'
import type { JobListItem } from '@/service/api/job-api'
import type { AgentSession } from '@/service/api/session-api'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import clsx from 'clsx'
import { STEP_NAME, type TaskStep } from './task-next-move'
import { formatDate, getSeverityBadge } from './ticket-display'
import type { TaskPageData } from './use-task-page'

const STATUS_DOT: Record<string, string> = {
  queued: 'bg-amber-500',
  active: 'bg-blue-500 animate-pulse',
  waiting_on_user: 'bg-orange-500',
  waiting_on_approval: 'bg-orange-500',
  completed: 'bg-green-600',
  failed: 'bg-red-500',
  cancelled: 'bg-[var(--gray-8)]',
}

type HistoryEntry =
  | { kind: 'run'; at: string; run: JobListItem; number: number }
  | { kind: 'session'; at: string; session: AgentSession }

function stepName(kind: string): string {
  return kind in STEP_NAME ? STEP_NAME[kind as TaskStep] : 'Scheduled'
}

/** Runs and live sessions, newest first; runs numbered within their step. */
function buildHistory(runs: JobListItem[], sessions: AgentSession[]): HistoryEntry[] {
  const counts = new Map<string, number>()
  const numbered = [...runs].reverse().map((run) => {
    const number = (counts.get(run.jobKind) ?? 0) + 1
    counts.set(run.jobKind, number)
    return { kind: 'run' as const, at: run.createdAt, run, number }
  })
  const entries: HistoryEntry[] = [...numbered, ...sessions.map((session) => ({ kind: 'session' as const, at: session.createdAt, session }))]
  return entries.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
}

interface TaskSidebarProps {
  data: TaskPageData
  project: string
  openRunId: string | null
  onOpenRun: (runId: string) => void
}

/** The task's details and everything that has happened on it. */
export function TaskSidebar({ data, project, openRunId, onOpenRun }: TaskSidebarProps) {
  const { ticket } = data
  const severity = getSeverityBadge(ticket.severity)
  const history = buildHistory(data.runs, data.sessions)

  return (
    <aside className="space-y-8 lg:sticky lg:top-6 lg:self-start lg:border-l lg:border-[var(--gray-6)] lg:pl-8">
      <FactList title="Details">
        <Fact label="Severity">
          <Badge color={severity.color}>{severity.label}</Badge>
        </Fact>
        <Fact label="Category">{ticket.category}</Fact>
        {ticket.externalTicketUrl && (
          <Fact label="Tracker">
            <a
              href={ticket.externalTicketUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[var(--accent-11)] underline decoration-[var(--gray-7)] underline-offset-2 hover:decoration-current"
            >
              {ticket.ticketSystem}
              {ticket.externalTicketId ? ` #${ticket.externalTicketId}` : ''}
              <ExternalLinkIcon className="size-3" />
            </a>
          </Fact>
        )}
        <Fact label="Created">{formatDate(ticket.createdAt)}</Fact>
      </FactList>

      {history.length > 0 && (
        <section>
          <h2 className="text-[11px] font-semibold tracking-[0.12em] text-[var(--gray-10)] uppercase">History</h2>
          <ul className="mt-2 space-y-0.5">
            {history.map((entry) =>
              entry.kind === 'run' ? (
                <li key={entry.run.jobId}>
                  <button
                    type="button"
                    onClick={() => onOpenRun(entry.run.jobId)}
                    aria-current={openRunId === entry.run.jobId ? 'true' : undefined}
                    className={clsx(
                      'flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-sm',
                      openRunId === entry.run.jobId ? 'bg-[var(--accent-3)] text-[var(--gray-12)]' : 'text-[var(--gray-11)] hover:bg-[var(--gray-3)]'
                    )}
                  >
                    <span aria-hidden className={clsx('mt-1.5 size-2 shrink-0 self-start rounded-full', STATUS_DOT[entry.run.status])} />
                    <span className="min-w-0 flex-1 leading-snug">
                      <span className="block truncate">
                        {stepName(entry.run.jobKind)} run #{entry.number}
                      </span>
                      <span className="block text-xs text-[var(--gray-9)]">
                        {formatJobStatus(entry.run.status).label.toLowerCase()} · <Timestamp date={entry.run.createdAt} className="inherit-colors" />
                      </span>
                    </span>
                  </button>
                </li>
              ) : (
                <li key={entry.session.id}>
                  <Link
                    href={`/spaces/${project}/sessions/${entry.session.id}`}
                    className="flex items-center gap-2.5 rounded px-2 py-1.5 text-sm text-[var(--gray-11)] hover:bg-[var(--gray-3)]"
                  >
                    <span aria-hidden className={clsx('mt-1.5 size-2 shrink-0 self-start rounded-full', STATUS_DOT[entry.session.status] ?? 'bg-[var(--gray-8)]')} />
                    <span className="min-w-0 flex-1 leading-snug">
                      <span className="block truncate">{stepName(entry.session.mode)} session</span>
                      <span className="block text-xs text-[var(--gray-9)]">
                        {entry.session.status.replace(/_/g, ' ')} · <Timestamp date={entry.session.createdAt} className="inherit-colors" />
                      </span>
                    </span>
                  </Link>
                </li>
              )
            )}
          </ul>
        </section>
      )}
    </aside>
  )
}
