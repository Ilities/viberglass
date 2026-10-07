import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/badge'
import { Fact, FactList } from '@/components/fact-list'
import { formatTicketSystem } from '@/lib/formatters'
import { initialsOf } from '@/lib/initials'
import { ExternalLinkIcon } from '@radix-ui/react-icons'
import type { TaskParticipant, Ticket } from '@viberglass/types'
import { useState } from 'react'
import { TaskPeople } from './task-people'
import { formatDate, getSeverityBadge } from './ticket-display'
import { withRole, type TaskParticipants } from './use-task-participants'

function firstName(person: TaskParticipant): string {
  return person.name.split(' ')[0]
}

/** "Quinn", "Quinn and Aino", "Quinn, Aino and Tomi". */
function names(people: TaskParticipant[]): string {
  const first = people.map(firstName)
  return first.length < 3 ? first.join(' and ') : `${first.slice(0, -1).join(', ')} and ${first[first.length - 1]}`
}

function Person({ person, children }: { person: TaskParticipant; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Avatar size="1" initials={initialsOf(person.name) || '?'} />
      {children}
    </span>
  )
}

/** "Owner Dev": a quiet label, then who. */
function LineFact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[var(--gray-10)]">{label}</span>
      <span className="text-[var(--gray-12)]">{children}</span>
    </span>
  )
}

/**
 * Who's on the task in one line: who owns it, who reviews, who watches. The
 * task's details and changing its people are folded under Details.
 */
export function TaskContextLine({ ticket, people }: { ticket: Ticket; people: TaskParticipants }) {
  const severity = getSeverityBadge(ticket.severity)
  const participants = people.participants ?? []
  const owner = withRole(participants, 'owner')[0]
  const reviewers = withRole(participants, 'reviewer')
  const watchers = withRole(participants, 'watcher')
  const [open, setOpen] = useState(false)

  return (
    <div className="text-xs text-[var(--gray-11)]">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <LineFact label="Owner">{owner ? <Person person={owner}>{firstName(owner)}</Person> : 'Nobody yet'}</LineFact>
        {reviewers.length > 0 && (
          <LineFact label={reviewers.length === 1 ? 'Reviewer' : 'Reviewers'}>
            {reviewers.length === 1 ? <Person person={reviewers[0]}>{firstName(reviewers[0])}</Person> : names(reviewers)}
          </LineFact>
        )}
        {watchers.length > 0 && <LineFact label="Watching">{names(watchers)}</LineFact>}
        <button
          type="button"
          aria-expanded={open}
          aria-controls="task-details"
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1 hover:text-[var(--gray-12)]"
        >
          <span aria-hidden>{open ? '▾' : '▸'}</span>
          Details · {severity.label} severity · {ticket.category}
        </button>
      </div>
      {/* Below the line, not inside it, so opening the details doesn't push the line's other parts around. */}
      {open && (
        <div
          id="task-details"
          className="mt-4 grid gap-6 rounded-[7px] border border-[var(--gray-5)] bg-[var(--gray-2)] p-4 sm:grid-cols-2"
        >
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
          <TaskPeople taskId={ticket.id} people={people} />
        </div>
      )}
    </div>
  )
}
