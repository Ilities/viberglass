import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatAutoFixStatus, formatSeverity, formatTimestamp } from '@/data'
import { PlayIcon } from '@radix-ui/react-icons'
import { TICKET_STATUS, type Clanker, type Ticket } from '@viberglass/types'
import { useMemo, useState } from 'react'

interface TicketsTableProps {
  tickets: Ticket[]
  clankers: Clanker[]
  project: string
  selectedTicketIds: Set<string>
  showArchived: boolean
  isArchiveMutationPending: boolean
  onToggleTicketSelection: (ticketId: string) => void
  onToggleAllTicketSelection: (checked: boolean) => void
  onArchiveTicket: (ticketId: string) => void
  onUnarchiveTicket: (ticketId: string) => void
}

function formatStatus(status: Ticket['status']): { label: string; className: string } {
  if (status === TICKET_STATUS.RESOLVED) {
    return {
      label: 'Resolved',
      className: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200',
    }
  }
  if (status === TICKET_STATUS.IN_PROGRESS) {
    return {
      label: 'In Progress',
      className: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
    }
  }
  return {
    label: 'Open',
    className: 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-zinc-200',
  }
}

export function TicketsTable({
  tickets,
  clankers,
  project,
  selectedTicketIds,
  showArchived,
  isArchiveMutationPending,
  onToggleTicketSelection,
  onToggleAllTicketSelection,
  onArchiveTicket,
  onUnarchiveTicket,
}: TicketsTableProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const canRun = activeClankers.length > 0

  const allVisibleSelected = useMemo(
    () => tickets.length > 0 && tickets.every((ticket) => selectedTicketIds.has(ticket.id)),
    [selectedTicketIds, tickets]
  )

  function handleRunClick(ticket: Ticket, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setSelectedTicket(ticket)
  }

  function handleToggleSelection(ticketId: string, e: React.MouseEvent | React.ChangeEvent) {
    e.preventDefault()
    e.stopPropagation()
    onToggleTicketSelection(ticketId)
  }

  function stopRowNavigation(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  function handleToggleAll(checked: boolean, e: React.ChangeEvent<HTMLInputElement>) {
    e.preventDefault()
    e.stopPropagation()
    onToggleAllTicketSelection(checked)
  }

  function handleArchive(ticketId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onArchiveTicket(ticketId)
  }

  function handleUnarchive(ticketId: string, e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    onUnarchiveTicket(ticketId)
  }

  return (
    <>
      <Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader className="w-12">
              <input
                aria-label="Select all visible tickets"
                type="checkbox"
                checked={allVisibleSelected}
                onChange={(event) => handleToggleAll(event.target.checked, event)}
              />
            </TableHeader>
            <TableHeader>Title</TableHeader>
            <TableHeader>Severity</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Auto-Fix</TableHeader>
            <TableHeader>Reported</TableHeader>
            <TableHeader className="w-28">Archive</TableHeader>
            <TableHeader className="w-12">
              <span className="sr-only">Actions</span>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((ticket) => {
            const status = formatStatus(ticket.status)
            const isSelected = selectedTicketIds.has(ticket.id)

            return (
              <TableRow key={ticket.id} href={`/project/${project}/tickets/${ticket.id}`}>
                <TableCell excludeRowLink>
                  <input
                    aria-label={`Select ticket ${ticket.title}`}
                    type="checkbox"
                    checked={isSelected}
                    onChange={(event) => handleToggleSelection(ticket.id, event)}
                    onClick={stopRowNavigation}
                  />
                </TableCell>
                <TableCell className="font-medium">{ticket.title}</TableCell>
                <TableCell>
                  <Badge color={formatSeverity(ticket.severity).badgeColor}>{formatSeverity(ticket.severity).label}</Badge>
                </TableCell>
                <TableCell>{ticket.category}</TableCell>
                <TableCell>
                  <Badge className={status.className}>{status.label}</Badge>
                </TableCell>
                <TableCell>
                  {ticket.autoFixStatus ? (
                    <Badge className={formatAutoFixStatus(ticket.autoFixStatus).color}>
                      {formatAutoFixStatus(ticket.autoFixStatus).label}
                    </Badge>
                  ) : (
                    <span className="text-zinc-400">-</span>
                  )}
                </TableCell>
                <TableCell className="text-zinc-500 dark:text-zinc-400">{formatTimestamp(ticket.timestamp)}</TableCell>
                <TableCell excludeRowLink>
                  {showArchived ? (
                    <Button
                      plain
                      disabled={isArchiveMutationPending}
                      onClick={(event) => handleUnarchive(ticket.id, event)}
                    >
                      Unarchive
                    </Button>
                  ) : (
                    <Button plain disabled={isArchiveMutationPending} onClick={(event) => handleArchive(ticket.id, event)}>
                      Archive
                    </Button>
                  )}
                </TableCell>
                <TableCell excludeRowLink>
                  <Button
                    plain
                    onClick={(event) => handleRunClick(ticket, event)}
                    title={canRun ? `Run with clanker` : 'No active clankers available'}
                  >
                    <PlayIcon className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <RunTicketModal
        ticket={selectedTicket}
        clankers={clankers}
        project={project}
        open={!!selectedTicket}
        onClose={() => setSelectedTicket(null)}
      />
    </>
  )
}
