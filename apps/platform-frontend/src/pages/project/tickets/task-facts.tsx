import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { formatTicketSystem } from '@/lib/formatters'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import type { Ticket } from '@viberglass/types'
import { formatDate, getSeverityBadge } from './ticket-display'
import { TaskPeople } from './task-people'

/**
 * The task's details and its people. What happened on it is in the thread.
 * On a narrow screen they fold away, so the conversation comes first.
 */
export function TaskFacts({ ticket, collapsed = false }: { ticket: Ticket; collapsed?: boolean }) {
  const severity = getSeverityBadge(ticket.severity)

  const details = (
    <FactList title="Details">
      <Fact label="Key">
        <span className="font-mono text-[13px]">{ticket.key}</span>
      </Fact>
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
            {formatTicketSystem(ticket.ticketSystem)}
            {ticket.externalTicketId ? ` #${ticket.externalTicketId}` : ''}
            <ExternalLinkIcon className="size-3" />
          </a>
        </Fact>
      )}
      <Fact label="Created">{formatDate(ticket.createdAt)}</Fact>
    </FactList>
  )
  // People decide whose move it is, so they stay; the rest is a click away.
  const facts = (
    <div className="space-y-4">
      <TaskPeople taskId={ticket.id} />
      <details>
        <summary className="cursor-pointer text-xs text-[var(--gray-10)]">
          Task details · {severity.label} severity · {ticket.category}
        </summary>
        <div className="mt-3">{details}</div>
      </details>
    </div>
  )
  if (!collapsed) return facts
  return (
    <details className="rounded-lg border border-[var(--gray-5)] px-4 py-2">
      <summary className="cursor-pointer text-sm font-medium text-[var(--gray-11)]">Details and people</summary>
      <div className="mt-3">{facts}</div>
    </details>
  )
}
