import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { formatTicketSystem } from '@/lib/formatters'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import type { Ticket } from '@viberglass/types'
import { formatDate, getSeverityBadge } from './ticket-display'
import { TaskPeople } from './task-people'

/** The task's details and its people. What happened on it is in the thread. */
export function TaskFacts({ ticket }: { ticket: Ticket }) {
  const severity = getSeverityBadge(ticket.severity)

  return (
    <div className="grid gap-8 sm:grid-cols-2">
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

      <TaskPeople taskId={ticket.id} />
    </div>
  )
}
