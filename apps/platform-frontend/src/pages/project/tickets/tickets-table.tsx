import { Badge } from '@/components/badge'
import { Button } from '@/components/button'
import { RunTicketModal } from '@/components/run-ticket-modal'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/table'
import { formatAutoFixStatus, formatSeverity, formatTimestamp, type TicketSummary } from '@/data'
import { PlayIcon } from '@radix-ui/react-icons'
import type { Clanker, Ticket } from '@viberglass/types'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'

interface TicketsTableProps {
  tickets: TicketSummary[]
  fullTickets: Ticket[]
  clankers: Clanker[]
  project: string
}

export function TicketsTable({ tickets, fullTickets, clankers, project }: TicketsTableProps) {
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null)
  const navigate = useNavigate()
  const activeClankers = clankers.filter((c) => c.status === 'active' && c.deploymentStrategyId)
  const canRun = activeClankers.length > 0

  function handleRunClick(ticketSummary: TicketSummary, e: React.MouseEvent) {
    e.preventDefault() // Prevent row navigation
    e.stopPropagation()
    const fullTicket = fullTickets.find((t) => t.id === ticketSummary.id)
    if (fullTicket) {
      setSelectedTicket(fullTicket)
    }
  }



  return (
    <>
      <Table className="mt-8 [--gutter:--spacing(6)] lg:[--gutter:--spacing(10)]">
        <TableHead>
          <TableRow>
            <TableHeader>Title</TableHeader>
            <TableHeader>Severity</TableHeader>
            <TableHeader>Category</TableHeader>
            <TableHeader>Status</TableHeader>
            <TableHeader>Auto-Fix</TableHeader>
            <TableHeader>Reported</TableHeader>
            <TableHeader className="w-12">
              <span className="sr-only">Actions</span>
            </TableHeader>
          </TableRow>
        </TableHead>
        <TableBody>
          {tickets.map((ticket) => (
            <TableRow key={ticket.id} href={`/project/${project}/tickets/${ticket.id}`}>
              <TableCell className="font-medium">{ticket.title}</TableCell>
              <TableCell>
                <Badge color={formatSeverity(ticket.severity).badgeColor}>{formatSeverity(ticket.severity).label}</Badge>
              </TableCell>
              <TableCell>{ticket.category}</TableCell>
              <TableCell>
                <Badge
                  className={
                    ticket.status === 'resolved'
                      ? 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200'
                      : ticket.status === 'in_progress'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-white/10 dark:text-zinc-200'
                  }
                >
                  {ticket.status === 'in_progress'
                    ? 'In Progress'
                    : ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                </Badge>
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
                <div className="flex items-center gap-1">
                  <Button
                    plain
                    onClick={(e) => handleRunClick(ticket, e)}
                    title={canRun ? `Run with clanker` : 'No active clankers available'}
                  >
                    <PlayIcon className="h-4 w-4" />
                  </Button>

                </div>
              </TableCell>
            </TableRow>
          ))}
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
